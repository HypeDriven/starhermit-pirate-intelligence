# Pirate Intelligence — v0.2

A playable pirate crew simulation, built on the **actual StarHermit engine 1.30.0, host API 1.32**. The attached concept informed the small ships, island landmarks, sea view, and close-up ship management. The first art pass is original low-poly geometry rather than video frames or licensed assets.

## Play

The hosted game opens in local practice. Sign in to create or join a persistent sea. Select an island or port and **Set course**. **E / Q** or the wheel switches between ship and sea views. **C** opens crew orders. **F** fires at the selected target. **H** takes or leaves the manual helm; hold **W/A/D** or arrow keys to sail and steer. The left rail becomes a three-deck selector aboard ship. Touch controls are available through the on-screen buttons; landscape is recommended.

An easy first voyage:

1. Accept **Wood You Kindly** under Contracts.
2. Sail to Mossjaw Cay. The crew sails and anchors automatically.
3. Launch Peg and Pip in a longboat to chop timber. Choose safe driftwood or the risky grove; their absence affects staffing.
4. Sail to Saltwick to trade, resupply or fit a hull upgrade.
5. Set a hunting directive, pick a target and bring it within 17 fathoms.

Practice state is saved on the device every ten seconds. Refresh resumes the same ship. This is distinct from an online world stored by StarHermit.

## What is implemented

- Six named sailors with roles, station reservations, duty explanations, editable habits, contextual preferences, captain trust, shared bonds and adventure stories.
- Standing repair/rest thresholds, storm shelter and automatic hunting fire. Direct orders and emergency warrants stay above model suggestions.
- Low-load browser CPU brains with individual context and optional external OpenAI-compatible models.
- Nine destinations, four shared port markets, three cargo classes, stock replenishment, scarcity prices, one-time contracts and daily deliveries. Harbour guns protect anchored port ships.
- Manual helm with wind, touch/keyboard controls, reef stops, broadside arcs, three ammunition types and risky boarding of weakened raiders.
- Fire, flooding, damaged rigging, expedition injuries, rest and medical care; six three-level ship fittings.
- Safe/risky island and wreck encounters with party skill and bond bonuses; automatic safe return when no choice is made.
- A welcome guide, sea atlas, captain’s log, exploration milestones, renown, authored crew barks, optional sea ambience and procedural combat/reward sounds.
- Persistent StarHermit rooms, device practice saves, migration of older snapshots, private crew views, shared authority rules and a scene using instanced repeated geometry.

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

The published game is `546dae33-aa48-4775-bff9-c0c48deb759f`. Build a small web upload and a separate verified model object, then publish to that existing game with the registered deployment key:

```sh
starhermit-tools package --web . --out ../pirate-intelligence-upload --remote-out ../pirate-intelligence-objects
starhermit-tools publish --game-id 546dae33-aa48-4775-bff9-c0c48deb759f --upload ../pirate-intelligence-upload --remote-out ../pirate-intelligence-objects
```

Never commit access tokens or private keys. Older online sessions may retain their original rules/build; create a new sea for the expanded feature set when the World panel indicates an older session.

After launch on StarHermit, sign in using the engine's account menu. In **World & crew**, create a persistent sea and share its room code. Other captains join the same room. Worlds support 8 room seats (a companion officer consumes a seat); the rules cap retained ships at 16. Server code trusts `ctx.message.from`, never a client-supplied owner ID. Ship memories are sent only to their owner and an explicitly authorised companion.

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

At an island, wait for the anchor, open **Longboat** (or **Go ashore · timber**), leave **Chop timber** and Peg/Pip selected, then **Lower the longboat**. The party rows ashore and returns with timber automatically; the encounter offers an optional risky haul. **Watch the shore party** follows their work. Wrecks offer salvage instead.

**Options → StarHermit engine options** opens runtime graphics and frame-rate settings; **F1** opens it directly. Sound and browser brain CPU controls are also in Options, with **Low load** selected by default. The clock, wind, compass and minimap stay visible during sailing. Aboard ship, select a deck in the left rail, or cycle the deck button on phones.

The remaster includes new ship and island geometry, animated ocean and rigging, illustrated crew portraits, a nautical chart, and refreshed brass/teal menus. The original Yue score follows harbour, sailing and combat; 14 MOSS effects cover cannons, impacts, anchors, rigging, oars, timber work, rewards, warnings and ambience. Use **Options** for saved music/effects controls. Audio begins after the first interaction and uses the engine mixer.

Generation provenance and event bindings: [art](assets/art/manifest.json), [soundtrack](music/manifest.json), [effects](sfx/manifest.txt). The bundled heading font is Cormorant Garamond under its [SIL Open Font License](assets/fonts/OFL.txt). `tools/prepare-audio.py --yue /path/to/yue-takes --moss /path/to/moss-wavs` reproduces the compact Ogg masters from the recorded takes.
