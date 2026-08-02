---
name: GitHub publishing
description: GitHub may show as connected while its credential proxy and Git credentials remain unavailable in the workspace.
---

The GitHub integration can report `added` while `listConnections("github")` returns no usable connection and HTTPS Git push fails with an authentication error. A repository with an existing unrelated `main` branch may also require a deliberate force update after access is restored.

**Why:** The standalone project was prepared and validated locally, but both the Git helper and connector API lacked an authenticated session despite repeated rebinding.

**How to apply:** Before attempting a large GitHub upload, verify both `listConnections("github")` and a repository read through `proxyFetch`; do not expose or request raw tokens.