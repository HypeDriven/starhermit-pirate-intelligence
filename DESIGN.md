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

An officer can warrant off-role work during measurable danger, including fire and flooding. Direct player orders reserve their stations for 35 seconds; fresh model choices reserve them for 18 seconds. The first mate fills the remaining stations each watch, explaining assignments and asking for uncovered urgent duties. Players can set repair/rest thresholds, shelter through squalls, choose preferred duties, discourage a habit, or forget it.

Orders and praise retain bounded task preferences and separate weights for each directive/danger context. Trust, fatigue and injuries affect working efficiency. Shared expeditions and boarding build sailor-to-sailor bonds and a short history of authored shared stories; strong bonds improve expedition odds. There is no permanent crew death, mutiny or model fine-tuning.

## Decision-model contract

Input: role, personality, directive, observable ship state, nearby enemies, fatigue, learned preferences, recent orders and allowed task enum. Output: `{"task":"repair"}`. No generated dialogue or free-form executable plans. A model proposal has no authority to modify resources, travel, rewards, damage, experience or rank. The server authenticates the sender, validates explicit delegation, command priority, rate, task, crew presence and emergency warrant.

The browser provider shares one 138 MiB Q8_0 model, runs a serial inference lane with short SIMD work slices and defaults to a 10% single-core pacing target. It uses the captain’s existing authority/socket. Its inputs include current available stations, preferred duty, trust, injuries and damage control; changed orders invalidate unfinished work. The optional external companion retains its separate authorised participant and bounded HTTP calls.

## Sailing, combat and shore work

Nine destinations support four distinct port markets and longer trading routes. Charted courses remain available; manual helm adds wind-influenced movement, dead-man input expiry, reef stops and manual broadside arcs. Round shot, chain shot and grape shot serve different purposes. Two sailors may board a weakened NPC raider for a timed, risky prize attempt. Sinking recalls all away parties and clears stale steering and hazards.

Fires, leaks and rigging damage make repair staffing and pumps useful. The shipyard offers three levels each of hull, sails, guns, hold, hammocks and bilge pump. Safe/risky expedition encounters use party skills, bonds and health; unanswered encounters take the safe haul. Injuries heal through rest or port medical care.

Spice, sailcloth and medicine share the hold. Port stock replenishes and scarcity shifts prices, with a guaranteed local spread to prevent same-port profit or free XP loops. One-time contracts, daily deliveries, exploration, renown and a captain’s journal give the crew further goals.

## Persistence and multiplayer

The authoritative document contains world time, public locations, raiders and player ships. Owner-only views contain crew memories. A deliberately authorised companion receives only the assigned ship's decision context. Jint invocations return state; there is no mutable process-local game state. Offline practice executes the same server file in StarHermit's authority worker.

The first online package uses join-in-progress persistent rooms and freezes empty worlds. Next, a server container can host named shards that remain active, journal commands, partition the sea and process offline catch-up. That requires a real deployment, operational budgets and load testing; this slice does not claim MMO scale.

## Next playtest decisions

The next changes need observations from a human voyage: whether Low load decisions feel useful, whether manual helm and broadsides are comfortable, and whether trade/boarding/expedition payouts create worthwhile choices. Persistent global shards, player boarding rules, permanent consequences and a larger authored campaign remain separate design and operational decisions. Current rooms support a small shared sea and pause while empty.

Success criteria: captains can leave the routine to crew, understand why an intervention was refused, see a repeat order become a habit, and tell a story about an expedition that made ship staffing awkward. Models should add character and useful autonomy without becoming a requirement for basic play.
