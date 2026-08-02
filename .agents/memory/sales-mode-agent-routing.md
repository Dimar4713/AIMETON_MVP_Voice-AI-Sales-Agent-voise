---
name: Sales mode agent routing
description: Durable rule for mapping sales directions to independent ElevenLabs agents.
---

Each sales direction is an independent agent slot: `online_course`, `fitness_membership`, and `crm_system`. The selected direction must determine both the displayed agent ID and the signed conversation URL; never fall back to another direction's agent.

**Why:** A single shared agent ID made the UI appear to switch products while calls continued using the previous agent's prompt and configuration.

**How to apply:** Store configuration by sales mode, show the selected slot's ID and file metadata, block calls when that slot has no agent, and pass the selected sales mode to the signed-URL endpoint.