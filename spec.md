# Pirate Intelligence

A pirate captain simulation with six named crew, persistent shared seas, direct orders, learned task preferences and constrained model decisions.

The default individual brain runs SmolLM2 135M entirely on the browser CPU. Share model weights and one inference lane across characters while keeping prompts, memories and preferences individual. Low system load is the default: target 10% of one core with short work slices, deliberate idle gaps and automatic suspension while hidden. Expose Low load, Balanced, Faster and Paused in the brain UI and remember the selection locally. These are inference pacing targets, not exact CPU caps.

Download and verify model weights once, cache them when browser storage allows, and show loading/thinking status. The default needs no localhost service, Python, API key or companion account. External OpenAI-compatible models remain an optional companion workflow. Built-in instincts keep the ship playable while a model loads, thinks, fails or is paused.

Each decision selects a legal crew task. Direct orders take priority, and the authority validates ownership, duties and emergency warrants. Discard interrupted work when switching worlds, hiding the game, changing providers or receiving a direct order. Model output never moves ships, spends gold or bypasses game rules. Pirate speech remains authored.
