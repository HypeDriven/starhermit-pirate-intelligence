# Pirate Intelligence — v0.1

A playable vertical slice of a persistent pirate crew game, built on the **actual StarHermit engine 1.20.0, host API 1.22**. The attached concept informed the small ships, island landmarks, sea view, and close-up ship management. The first art pass is original low-poly geometry rather than video frames or licensed assets.

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
- Individual model configurations, private learned context, a local OpenAI-compatible decision adapter and a tiny CPU model launcher. All model choices are validated again by the authority.
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

## Local LLMs and the tiny CPU default

**Decision-model-only** is implemented as constrained JSON task selection. Dialogue is authored; no generative voice/chat pipeline is included. Instincts are deterministic game rules, explicitly labelled in the UI; they are not presented as an LLM.

The engine sandbox does not expose arbitrary HTTP. Its [documented gameplay API](https://wiki.starhermit.com/docs/api/games.html#gameplay-websocket) also permits only one gameplay socket per user per session. Therefore the local companion uses a **separate participant account**, authorised by the captain for crew task proposals only. It cannot move the captain's ship, trade, spend gold, fire, or bypass emergency restrictions. This is a deliberate compatibility boundary rather than a fabricated engine networking method.

1. Install [llama.cpp](https://github.com/ggml-org/llama.cpp/releases), with `llama-server` on PATH, and Python 3.10+.
2. `python -m pip install -r companion/requirements.txt`
3. Configure each crew member under **Individual brain**, then export `crew-brains.json`. Alternatively copy `companion/crew-brains.example.json` and edit it. The sample deliberately shows Fuse using a separate endpoint; remove that override if every crew member should use the tiny default.
4. Join the persistent world with a separate companion account, then close that account's game window before starting the companion. Keep the captain's game window open. Set `STARHERMIT_BRAIN_TOKEN` to the companion account's **game-scoped launch token**, obtained through your own authorised API client. Tokens are read from the environment only, never from command-line arguments or the model prompt.
5. Start:

```sh
python companion/brain_bridge.py --game ASSIGNED_GAME_UUID --session WORLD_SESSION_UUID --config crew-brains.json --tiny
```

The `--tiny` option starts **SmolLM2-135M-Instruct Q4_K_M**, a quantised model of about 105 MB, with CPU inference (`-ngl 0`). llama.cpp downloads and caches weights on the first run. It is small and limited; a larger local model can make better decisions. The bridge calls standard `POST /v1/chat/completions`; LM Studio, llama.cpp, Ollama's OpenAI-compatible API, and other conforming servers can be configured separately for every character. API keys reference local environment variable names.

The companion prints its user ID. Enter it in the captain's **World & crew → Local brain officer** field and authorise. The server then sends that participant private crew context. Model calls happen on your machine, at most one per character per 12 seconds, serially; credentials stay local. API faults, timeouts, malformed JSON, off-role tasks and late replies leave instincts running. The server reverts to instincts after a model is silent for 18 seconds, at its next eight-second watch boundary.

Changing endpoints is local configuration. Export again and restart the companion after edits. A tiny model and live StarHermit account connection were **not available for end-to-end testing** here; the adapter was tested against a real local HTTP test server implementing the OpenAI response format. No model weights are bundled or downloaded by the preview.

## Checks

```sh
node --test tests/server.test.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
starhermit check .
```

The rules suite covers three authenticated participants, ownership/privacy, hierarchy, command priority, LLM delegation/rate limits, travel, crew absence, trade prices, combat constraints, levels, one-time contract payouts, membership, paused time and malformed commands. The companion suite exercises its actual HTTP adapter. The real runtime loaded the authoritative ship and six crew, and a temporary headless harness exercised desktop panel and deck code paths. Native GPU rendering was unavailable in the build container. The local HTTP browser preview was rejected by the engine (secure context required), and the private HTTPS site required a ChatGPT sign-in unavailable in the test browser. Visual playtesting is therefore unverified.

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
