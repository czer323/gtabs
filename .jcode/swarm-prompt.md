# Swarm Role Logic
Personalities are in `.omp/agents/`. Routing is in `.jcode/models.yaml`.

## Instructions
1. **Spawning**: Match role labels to `.omp/agents/<label>.md`. Use that content as the spawn prompt.
2. **Routing**: Read `.jcode/models.yaml`. Select the `model` for the role. If the primary model fails or is slow, iterate through `fallbacks` in order.
