# Pirate Intelligence

**Fantasy:** You captain a floating workplace disaster. Your crew can run the ship; your job is to decide what kind of trouble is worth getting into. Cute proportions, battered materials, warm brass, patched canvas, salty grudges. The ocean is beautiful. Everyone aboard is a little bit awful and worth keeping alive.

## The loop

Set intent → choose a voyage → watch the crew negotiate its tasks → intervene when it matters → earn gold, salvage and experience → improve ship and crew → take greater risks. Crew absence is a tactical cost: sending the carpenter ashore leaves nobody naturally repairing the ship. Rank exists to resolve real crises rather than erase specialties all the time.

| Layer | Player decisions | Crew decisions |
| --- | --- | --- |
| Strategic | Trade, hunt, explore, survive; destination and contract | Score ordinary duties against directive, fatigue and learned preferences |
| Ship | Direct orders, staffing, warrant, upgrades | Helm, lookout, guns, repair, galley, forage, rest |
| Sea | Position through destinations, target, broadside, anchorage | Navigation, repairs and optional hunting volleys |
| Shore | Destination, job and two-person team | Work assignment, expedition participation and return |

## Characters and command

Mara Morrow is captain, Barnaby Brisk first mate. Little Fuse is gunner, Peg Coppernail carpenter, Auntie Tallow cook, Pip Gulliver navigator. Every character has its own model configuration and preference/memory store. The default SmolLM2 135M weights are shared in the browser; prompts, requests and character state remain individual. Browser CPU usage defaults to Low load (a 10% single-core pacing target), with Balanced, Faster and Paused options. Inference yields in short slices and pauses while hidden.

An officer can warrant off-role work during measurable danger. Direct player orders stay above model proposals and autonomous choices. Invalid orders produce an explanation. The first implementation does not simulate mutiny, death, wounds or permanent personality drift.

Training is transparent: an explicit task order adds +0.7 to that character's task preference, praise +0.35, both capped at 6. A bounded history retains the directive and emergency context. This memory is supplied to a connected model. The instinct scheduler uses the task weights directly; contextual generalisation is left to the decision model. A later version should add approval/rejection feedback, editable habits and context-specific weights rather than silently inventing player preferences.

## Decision-model contract

Input: role, personality, directive, observable ship state, nearby enemies, fatigue, learned preferences, recent orders and allowed task enum. Output: `{"task":"repair"}`. No generated dialogue or free-form executable plans. A model proposal has no authority to modify resources, travel, rewards, damage, experience or rank. The server authenticates the sender, validates explicit delegation, command priority, rate, task, crew presence and emergency warrant.

Budget: independent character calls, one serial call per 12-second watch, eight-second request timeout, latest-state coalescing. Missing models use ordinary game instincts. Default weights are ~105 MB; the much larger engine and interpreter cannot safely host arbitrary model code, so inference stays in the optional local companion. The separate companion seat is the documented API workaround for the current engine sandbox and one-socket rule.

## Persistence and multiplayer

The authoritative document contains world time, public locations, raiders and player ships. Owner-only views contain crew memories. A deliberately authorised companion receives only the assigned ship's decision context. Jint invocations return state; there is no mutable process-local game state. Offline practice executes the same server file in StarHermit's authority worker.

The first online package uses join-in-progress persistent rooms and freezes empty worlds. Next, a server container can host named shards that remain active, journal commands, partition the sea and process offline catch-up. That requires a real deployment, operational budgets and load testing; this slice does not claim MMO scale.

## Next milestones

1. **Hosted playtest:** Register on StarHermit, verify two captains and a local brain officer against the actual platform; exercise disconnect/recovery and scopes. Test real tiny-model latency and decision validity on CPU.
2. **Better crew collaboration:** Explicit task requests between characters, task capacity and reservation, rank-aware refusal dialogue, contextual learned preferences and an editable captain's standing orders book.
3. **Richer naval play:** Free steering, wind/tacking, broadsides by facing, boarding, repairs by compartment, flooding and fire. This slice uses range-based combat and destination-based sailing.
4. **Away mission tactics:** Controllable boats, hazards, selectable encounters, salvage puzzles, injuries and rescue. The slice resolves expeditions with timers and bounded loot.
5. **Persistent economy:** Port stock, cargo classes, supply/demand, player bounties, reputation, ship classes and craft recipes.
6. **Art and audio:** Authored character silhouettes, cloth sail deformation, birds, weather, deck soundscape and optional authored voice barks. Maintain decision-only LLM scope until gameplay is proven.

Success criteria: captains can leave the routine to crew, understand why an intervention was refused, see a repeat order become a habit, and tell a story about an expedition that made ship staffing awkward. Models should add character and useful autonomy without becoming a requirement for basic play.
