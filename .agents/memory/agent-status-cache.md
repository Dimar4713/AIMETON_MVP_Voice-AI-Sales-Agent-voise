---
name: Agent status cache
description: Client-side consistency rule for agent creation and status refreshes.
---

When an agent is created or updated, update the shared agent-status query cache before any refetch. A stale status response can otherwise overwrite the locally visible agent list and make a newly created card show “agent not created”.

**Why:** The server had already persisted all three agents, but the UI briefly showed the new ID and then reverted because React Query still held the old one-agent response.

**How to apply:** Keep the status payload keyed consistently, merge by sales mode, then refetch to confirm the server state.