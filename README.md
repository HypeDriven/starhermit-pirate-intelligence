# Pirate Intelligence — v0.1

A playable vertical slice of a persistent pirate crew game, built on the **actual StarHermit engine 1.29.0, host API 1.31**. The attached concept informed the small ships, island landmarks, sea view, and close-up ship management. The first art pass is original low-poly geometry rather than video frames or licensed assets.

## Play

The private HTTPS preview opens directly in local practice. Select an island or port and **Set course**. **E / Q** or the wheel switches between ship and sea views. **C** opens crew orders. **F** fires at the selected target. The left rail becomes a three-deck selector aboard ship. Touch controls are available through the on-screen buttons; landscape is recommended.

An easy first voyage:

1. Accept **Wood You Kindly** under Contracts.
2. Sail to Mossjaw Cay. The crew sails and anchors automatically.
3. Launch Peg and Pip in a longboat to chop timber. Their absence affects staffing.
4. Sail to Saltwick to trade, resupply or fit a hull upgrade.
5. Set a hunting directive, pick a target and bring it within 17 fathoms.

Practice state is saved on the device every ten seconds. Refresh resumes the same ship. This is distinct from an online world stored by StarHermit.

## What is implemented

- One ship per participant; six individually named crew with roles, ordinary duties, XP, fatigue and preferences.
- Captain → first mate → specialist hierarchy. Off-role orders require an officer warrant **and** actual danger: hull under 45%, food under 12, or an enemy within 15 fathoms.
- High-level directives change crew task scoring. Direct commands take priority for 35 seconds, add a bounded task preference, and record the directive and danger context. Praise reinforces a task. This is interpretable preference learning, **not model fine-tuning**.
- A browser CPU decision model with per-character context, low-load controls, and optional external OpenAI-compatible models. All task choices are validated again by the authority.
- Two trading ports with distinct spice prices, resupply, ship upgrades, ship/crew levels, four contracts, NPC and player-ship combat, cannon costs/range/reload and sinking recovery.
- Three island/wreck destinations, two-person expeditions for timber, treasure or salvage, moving longboat, crew absence and return rewards.
- Ship/sea camera transition, three deck views, animated low-poly ships, island settlements, authored sailor shouts, and a crew log.
- Persistent StarHermit rooms, join codes, join-in-progress, reconnect/resync and saved-session selection. One shared authoritative server file also runs offline with `starhermit:script.authority`.

## Run and package with StarHermit

Download the [official Linux or Windows runtime](https://wiki.starhermit.com/docs/tutorials/starhermit-engine.html). No engine binaries are included in this repository.

```sh
starhermit types .
starhermit check .
starhermit . --dev
starhermit package --web . --out ../pirate-intelligence-web
# Serve the upload over HTTPS or localhost. Non-local HTTP is rejected by the engine.
python -m http.server 8085 --directory ../pirate-intelligence-web
```

On a local desktop, open `http://localhost:8085`. To play natively on Windows, run `starhermit.exe .`. The engine provides graphics, audio, input bindings, account UI and accessibility. The game uses the same license as StarHermit Engine; see the License section below.

## Online worlds

The private preview is **local practice**, not an already populated multiplayer deployment. Registration on StarHermit requires your publisher account/deployment key, which was not available in this session. The repository root includes the packaged launcher and file index for direct StarHermit GitHub loading. It is also ready for a folder upload:

```sh
# With official developer tools and your account credentials configured locally:
starhermit-tools package --web . --out ../pirate-intelligence-upload
starhermit-tools publish --new --upload ../pirate-intelligence-upload
```

Retain the **assigned game UUID** returned by publishing; it is not the display name or the ChatGPT Sites project ID. Subsequent updates use `--game-id ASSIGNED_UUID` rather than `--new`. Never commit access tokens or private keys.

After launch on StarHermit, sign in using the engine's account menu. In **World & crew**, create a persistent sea and share its room code. Other captains join the same room. Worlds support 8 room seats in this slice (a companion officer consumes a seat); the rules cap retained ships at 16. Server code trusts `ctx.message.from`, never a client-supplied owner ID. Ship memories are sent only to their owner and an explicitly authorised companion.

StarHermit's `persistent: true` pauses an empty session rather than keeping a server ticking forever. The game uses `ctx.now - ctx.pausedMs`; progression freezes while the world is empty and is subject to the platform's recovery retention policy. This is a persistent small shared sea, not a global MMO or an always-running shard. A container-backed shard is the next architecture step for the latter.

## Browser brains and CPU usage

**Tiny CPU default · in browser** runs SmolLM2-135M-Instruct Q8_0 locally using single-threaded WebAssembly SIMD. It needs no Python, localhost service, API key or second account. The 138 MB model downloads on first use through StarHermit's verified remote-file API and is cached when browser storage permits. The model, tokenizer and kernel are shared; each character receives its own personality, preferences, recent orders and live ship context. Existing `tiny` character settings now select the browser provider.

Under **Individual brain** or **Brain setup**, CPU usage is shared across all browser brains and saved on this device:

| Setting | Target inference load | Maximum work slice |
| --- | --- | --- |
| Low load (default) | 10% of one CPU core | 2 ms |
| Balanced | 25% of one CPU core | 4 ms |
| Faster | 50% of one CPU core | 8 ms |
| Paused | No inference | — |

These are cooperative pacing targets for inference, not operating-system CPU caps or limits on rendering/downloads. A small indivisible kernel call can exceed a slice on a slow device. Idle gaps follow measured work; unused time never accumulates into a burst. Inference pauses when hidden. Low load produces slower decisions; deterministic instincts fill the gaps. One character thinks at a time, with at least a minute between its requests and a 15-second rest between completed requests at Low load.

The model chooses a single legal task through constrained number-token decoding. The client checks current orders and duties again before sending the result through the captain's existing gameplay socket. The authority revalidates ownership, duty restrictions, emergency warrants and command priority. Pirate dialogue remains authored. No prompts or crew memories are sent to a model service. Native play uses instincts by default; this accelerated provider is for the web runtime.

### Optional external models

Choose **My OpenAI-compatible endpoint**, save the character and export `crew-brains.json`. External endpoints still use `companion/brain_bridge.py` because scripts have no arbitrary HTTP access. Browser-mode entries are skipped by the companion.

1. Install Python 3.10+ and `python -m pip install -r companion/requirements.txt`.
2. Join the persistent sea with a separate companion participant account, then close that account's game window. Keep the captain's window open.
3. Set `STARHERMIT_BRAIN_TOKEN` to that participant's game-scoped launch token from your authorised API client.
4. Run `python companion/brain_bridge.py --game ASSIGNED_GAME_UUID --session WORLD_SESSION_UUID --config crew-brains.json`.
5. Enter the companion's printed user ID under **World & crew → Local brain officer** and authorise it.

Each endpoint may use its own model and local API-key environment variable. It can propose crew tasks only. The legacy `--tiny` flag still launches llama.cpp on localhost for explicitly configured external characters; it is separate from the browser default.

### Build the browser model assets

The compiled kernel, tokenizer and tensor index are included. Model weights are excluded from Git. Maintainers run `python scripts/prepare-brain.py` to download the pinned GGUF, verify its SHA-256, extract the tokenizer/index and rebuild the SIMD kernel using Rust's `wasm32-unknown-unknown` target. The upstream weights use Apache 2.0; the license is in `models/LICENSE-Apache-2.0.txt`.

`scripts/build.sh` packages the model as a remote object. For a local preview serve `dist/`, including `dist/_remote/`. For StarHermit publication, upload the remote object with the platform tools before publishing the small web package; `starhermit-remote.json` pins it by hash. A source checkout without weights retains that index for packaging, but running locally needs the weights or a populated remote-object cache.

## Checks

```sh
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
starhermit check .
```

The browser suite checks CPU pacing, request privacy and duties, SIMD math against scalar results, and real-model inference against reference llama.cpp probabilities when weights are available. The rules suite covers three authenticated participants, ownership/privacy, hierarchy, command priority, LLM delegation/rate limits, travel, crew absence, trade prices, combat constraints, levels, one-time contract payouts, membership, paused time and malformed commands. The companion suite exercises its actual HTTP adapter. The real StarHermit runtime passes its headless check. A local packaged browser run with the official engine verifies model downloading/preparation, a completed crew decision, CPU setting changes, pause persistence after reload, and desktop/mobile brain controls. Native GPU rendering is not covered by these checks.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Real StarHermit scene, immediate-mode UI, camera, input and platform client |
| `server.js` | Shared authoritative rules for offline and multiplayer sessions |
| `starhermit.txt` | Pinned engine, capabilities, controls and server declaration |
| `companion/brain_bridge.py` | Local model calls and scoped StarHermit decision participant |
| `tests/` | Rules and OpenAI-compatible adapter checks |
| `DESIGN.md` | Game direction, model contract and next milestones |
| `scripts/build.sh` | Package the preview and a clean source download |

References: [engine tutorial](https://wiki.starhermit.com/docs/tutorials/starhermit-engine.html), [server scripts](https://wiki.starhermit.com/docs/api/game-scripts.html), [persistent sessions](https://wiki.starhermit.com/docs/tutorials/persistent-sessions.html), [SmolLM2 model quantisation](https://huggingface.co/QuantFactory/SmolLM2-135M-Instruct-GGUF).

## License

Pirate Intelligence’s first-party game code, assets, companion and documentation are distributed under the same terms as StarHermit Engine: the **PolyForm Noncommercial License 1.0.0**, including its additional permission for commercial game use while the game is published on StarHermit.com, publicly playable there and kept in running order there.

The exact, unmodified `LICENSE-engine` text from the official StarHermit 1.20.0 release is included as [`LICENSE`](LICENSE), preserving its required notice and additional permission. It is included in both the source download and packaged game. Third-party dependencies and externally downloaded model weights retain their respective licenses.
