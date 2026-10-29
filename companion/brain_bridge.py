#!/usr/bin/env python3
"""Local LLM decision officer for the StarHermit Pirate Intelligence game.

The engine exposes no arbitrary HTTP. This optional companion is a separate,
explicitly authorised participant. It never impersonates the captain and cannot
move ships, spend gold or bypass server rules. Model/API keys remain local.
"""
from __future__ import annotations
import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

TASKS = {'helm', 'lookout', 'guns', 'repair', 'cook', 'forage', 'rest'}
MODEL_REPO = 'QuantFactory/SmolLM2-135M-Instruct-GGUF:Q4_K_M'


def http_json(url, data=None, token=None, timeout=12):
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    payload = None
    if data is not None:
        payload = json.dumps(data).encode()
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, data=payload, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read(1_048_577)
        if len(body) > 1_048_576:
            raise ValueError('Response exceeded 1 MiB')
        return json.loads(body) if body else None


def load_config(path):
    config = json.loads(Path(path).read_text()) if path and Path(path).exists() else {}
    if config.get('schema', 1) != 1:
        raise ValueError('Unknown config schema')
    return config


def decision(context, character, config):
    """One bounded OpenAI-compatible call. Returns a task, never prose commands."""
    options = dict(config.get('default', {}))
    options.update(config.get('crew', {}).get(character['id'], {}))
    if options.get('mode') in ('instinct', 'browser'):
        return None
    endpoint = options.get('base_url', 'http://127.0.0.1:8080/v1').rstrip('/')
    parsed = urllib.parse.urlparse(endpoint)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Invalid endpoint URL')
    allowed = list(character['ordinary'])
    warrant = context.get('emergency', False)
    if warrant:
        allowed = sorted(TASKS)
    ship = context['ship']
    prompt = {
        'role': character['role'], 'personality': character['trait'],
        'directive': ship['directive'], 'hull': round(ship['hull']),
        'maxHull': ship['maxHull'], 'food': round(ship['food']),
        'timber': round(ship['timber']), 'ammo': ship['ammo'],
        'sailing': bool(ship['destination']), 'enemies': context['nearbyEnemies'],
        'fatigue': round(character['fatigue']), 'learnedPreferences': character['preferences'],
        'rememberedOrders': character['memories'][-5:], 'allowedTasks': allowed,
    }
    system = ('You are a pirate crew decision model. Choose ONE useful allowed task. '
              'Prioritise captain orders and learned preferences, repair a damaged hull, '
              'staff helm while sailing, guns near enemies, rest when tired. '
              'Return only JSON: {"task":"repair"}. No dialogue. '
              + str(options.get('system_prompt', ''))[:1000])
    body = {'model': options.get('model', 'smollm2-135m'),
            'messages': [{'role': 'system', 'content': system},
                         {'role': 'user', 'content': json.dumps(prompt, separators=(',', ':'))}],
            'temperature': 0.15, 'max_tokens': 40,
            'response_format': {'type': 'json_object'}}
    key = os.environ.get(options.get('api_key_env', ''), '') or None
    response = http_json(endpoint + '/chat/completions', body, key, timeout=8)
    raw = response['choices'][0]['message']['content']
    if not isinstance(raw, str) or len(raw) > 4096:
        return None
    match = re.search(r'\{[^{}]*\}', raw)
    if not match:
        return None
    parsed = json.loads(match.group())
    task = parsed.get('task')
    if task not in allowed:
        return None
    return {'type': 'decision', 'ownerId': context['ownerId'],
            'crewId': character['id'], 'task': task, 'issuer': 'brisk',
            'override': bool(warrant)}


def start_tiny():
    executable = shutil.which('llama-server')
    if not executable:
        raise SystemExit('Install llama.cpp from https://github.com/ggml-org/llama.cpp/releases '
                         'and put llama-server on PATH, or run your own endpoint without --tiny.')
    # llama.cpp downloads and caches the ~105 MB quantised weights on first run.
    process = subprocess.Popen([executable, '-hf', MODEL_REPO, '--host', '127.0.0.1',
                                '--port', '8080', '--alias', 'smollm2-135m', '-ngl', '0', '-c', '2048',
                                '--threads', str(max(1, min(4, (os.cpu_count() or 2) - 1)))],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('Starting tiny CPU model. First run downloads ~105 MB of model weights.')
    for _ in range(240):
        if process.poll() is not None:
            raise SystemExit('llama-server exited. Check the model download or whether port 8080 is in use.')
        try:
            http_json('http://127.0.0.1:8080/health', timeout=1)
            return process
        except (OSError, ValueError):
            time.sleep(1)
    process.terminate()
    raise SystemExit('Tiny model did not become ready within four minutes.')


async def run(args, config):
    try:
        import websockets
    except ImportError:
        raise SystemExit('Install the companion dependency: python -m pip install "websockets>=14,<16"')
    token = os.environ.get('STARHERMIT_BRAIN_TOKEN')
    if not token:
        raise SystemExit('Set STARHERMIT_BRAIN_TOKEN to the companion account’s game-scoped launch token. '
                         'Do not use the captain’s token; StarHermit allows one gameplay socket per player.')
    api = args.api.rstrip('/')
    if urllib.parse.urlparse(api).scheme != 'https' and not api.startswith('http://127.0.0.1:'):
        raise SystemExit('Platform API must use HTTPS (or the local development platform).')
    # JWT decode is display-only. The platform verifies the signature and sender.
    try:
        payload = token.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        user_id = claims.get('sub', '(see your companion profile)')
    except (ValueError, IndexError):
        user_id = '(see your companion profile)'
    print('Companion user ID:', user_id)
    print('Captain: authorise that ID in World & crew. This officer must already be a world participant.')
    latest = {}
    attempted = {}
    retry = 1
    while True:
        try:
            fresh = await asyncio.to_thread(http_json, api + '/api/v1/games/' + args.game + '/launch-token', {}, token)
            token = fresh['token']
            info = await asyncio.to_thread(http_json, api + '/api/v1/games/' + args.game, None, token)
            ws_url = ('wss' if api.startswith('https') else 'ws') + '://' + urllib.parse.urlparse(api).netloc + '/ws/v1/games?'
            ws_url += urllib.parse.urlencode({'sessionId': args.session, 'build': info['buildId']})
            # Non-browser client: bearer header keeps credentials out of URLs.
            async with websockets.connect(ws_url, additional_headers={'Authorization': 'Bearer ' + token},
                                          max_size=1_048_576, ping_interval=20) as socket:
                retry = 1
                await socket.send(json.dumps({'type': 'cmd', 'data': {'type': 'sync'}}))
                print('Connected. Waiting for authorised crew context…')

                async def reader():
                    async for frame in socket:
                        event = json.loads(frame)
                        data = event.get('data', {})
                        if event.get('type') == 'game' and data.get('type') == 'brain_context':
                            latest[data['ownerId']] = data
                        elif event.get('type') == 'error':
                            print('Authority:', event.get('error', 'command refused'))

                async def thinker():
                    while True:
                        for owner, context in list(latest.items()):
                            for character in context['ship']['crew']:
                                key = (owner, character['id'])
                                if character['away'] or character['manualUntil'] > context['time']:
                                    continue
                                if time.monotonic() - attempted.get(key, -999) < 12:
                                    continue
                                attempted[key] = time.monotonic()
                                try:
                                    output = await asyncio.to_thread(decision, context, character, config)
                                    if output:
                                        await socket.send(json.dumps({'type': 'cmd', 'data': output}))
                                        print(character['name'] + ': ' + output['task'])
                                except (OSError, ValueError, KeyError, IndexError):
                                    print(character['name'] + ': model unavailable/invalid; crew instincts continue.')
                            # Only one complete crew watch per loop; latest snapshots coalesce.
                        await asyncio.sleep(1)

                async def renewer():
                    nonlocal token
                    delay = max(30, min(1800, fresh.get('expiresInSeconds', 3600) * .7))
                    while True:
                        await asyncio.sleep(delay)
                        renewed = await asyncio.to_thread(http_json, api + '/api/v1/games/' + args.game + '/launch-token', {}, token)
                        token = renewed['token']
                        delay = max(30, min(1800, renewed.get('expiresInSeconds', 3600) * .7))

                read_task = asyncio.create_task(reader())
                think_task = asyncio.create_task(thinker())
                renew_task = asyncio.create_task(renewer())
                done, pending = await asyncio.wait([read_task, think_task, renew_task], return_when=asyncio.FIRST_COMPLETED)
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                for task in done:
                    task.result()
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise SystemExit('StarHermit authorisation ended or terms need acceptance. '
                                 'Sign in to the companion account and provide a fresh scoped token.')
            print('Platform unavailable. Retrying in', retry, 'seconds.')
        except (OSError, ValueError, KeyError, websockets.exceptions.WebSocketException):
            print('Connection interrupted. Retrying in', retry, 'seconds.')
        await asyncio.sleep(retry)
        retry = min(30, retry * 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', required=True, help='StarHermit assigned game UUID, not the display name')
    parser.add_argument('--session', required=True, help='Persistent world session UUID')
    parser.add_argument('--config', default='crew-brains.json')
    parser.add_argument('--api', default='https://api.starhermit.com')
    parser.add_argument('--tiny', action='store_true', help='Start the default 135M CPU model using llama.cpp')
    args = parser.parse_args()
    process = start_tiny() if args.tiny else None
    try:
        asyncio.run(run(args, load_config(args.config)))
    except KeyboardInterrupt:
        pass
    finally:
        if process:
            process.terminate()


if __name__ == '__main__':
    main()
