# AGENTS.md — Voice AI Sales Agent

## Scope

Эти правила обязательны для всего `AIMETON_MVP_Voice-AI-Sales-Agent-voise`. Более узкий `AGENTS.md` MAY усиливать, но не ослаблять их.

Каноническое AIMETON-wide governance-ядро: `Dimar4713/aimeton-architecture/AGENTS.md`.

## Repository mission

Репозиторий — MVP голосового AI-агента продаж. Он использует ElevenLabs Conversational AI и обрабатывает голос/транскрипты; поэтому privacy, явная provider/cost authority, server-side secrets и честное обозначение MVP-ограничений являются обязательными.

## Before work

1. Прочитать `README.md`, API contracts, server/client boundaries, active Issues/PR/CI и exact current SHA.
2. При межрепозиторной работе до первой mutation прочитать root `AGENTS.md` всех затрагиваемых AIMETON-репозиториев.
3. Для normative AIMETON решений читать `aimeton-architecture`; для deployment/network/provider/secrets reality — `aimeton-infrastructure`.
4. Не считать один голосовой диалог, provider response или local demo доказательством production readiness.

## 3×3 Reality Check

Перед blocker, root-cause, voice/privacy claim, provider conclusion, cost/security decision или consequential write первое объяснение считается гипотезой.

Проверить architecture/lifecycle, alternatives/control paths, history/live; source/contract, runtime/live, independent evidence; выполнить falsification attempt.

`нет доступа`, `ElevenLabs не работает`, `единственный путь`, `готово к продажам/production`, `нужен пользователь` без этого gate являются provisional claims.

## GitHub / execution fallback

До просьбы о ручном действии владельца проверить:

`GitHub connector/API → AIMETON GitHub MCP/router → REST/GraphQL/gh через trusted AIMETON server → owner`.

Ограничение одного token/runner/workflow не является ограничением AIMETON как системы. Secret values не публикуются; сначала использовать существующие auth/secret contracts.

## Continuous Mission / Motor State

```text
READ → DECIDE → ACTION → READ-BACK → EVIDENCE → NEXT SAFE ACTION
```

После каждого material action проверить фактический результат и выполнить следующий безопасный шаг при отсутствии objective authority blocker. Отсутствие нового сообщения владельца не является blocker.

Держать очередь current → next → following. Перед завершением tool-сессии обязательны MOTOR-CHECK и STOP-CHECK. GREEN build, PR или один successful call не завершают acceptance mission.

## Voice / privacy / human boundary

1. API keys and provider credentials remain server-side and must never reach browser logs, client bundles, Issues or evidence.
2. Microphone capture starts only after explicit user/browser permission and an explicit product action.
3. Audio, transcripts and conversation logs are user/customer data; retention, export and persistence must be explicit and documented.
4. Do not silently enable permanent recording, external analytics or secondary data use.
5. The MVP currently lacks multi-user authorization/history persistence; do not present those capabilities as implemented.
6. AI sales behavior must not fabricate product/service facts; business knowledge and pricing require governed source data.
7. Critical contractual/financial commitments remain outside autonomous agent authority unless a separate approved contract explicitly grants it.

## Provider / cost boundary

- Paid/quota-limited ElevenLabs operations require active owner/budget authority and bounded retry behavior.
- Distinguish provider outage, account entitlement/quota, network failure, application bug and insufficient product data.
- Avoid accidental creation of duplicate provider agents or repeated billable setup calls; use idempotent/read-back patterns where possible.
- Keep usage/cost evidence when provider operations are part of acceptance.

## Cross-repository source-of-truth

Infrastructure/provider/network facts belong to canonical AIMETON repositories. Generated projections MUST pin canonical repository, exact source SHA, source path, immutable blob/object id and/or digest; drift must fail closed.

Do not create a local second infrastructure/provider controller to bypass one workflow/token limitation.

## Authority boundary

Без owner authorization запрещены новые/увеличенные платные ресурсы, необратимые production/provider mutations, изменение legal/privacy/license boundaries, ослабление security/HITL gates и публикация secrets/private conversation data.

## Definition of Done

Применимые пункты обязательны:

- code/contracts/tests updated;
- client/server secret boundary checked;
- voice/privacy behavior verified;
- provider calls/cost evidence bounded and retained when authorized;
- CI/read-back verified;
- docs/MVP limitations synchronized;
- next safe action выполнен либо exact blocker зафиксирован;
- strong conclusions прошли 3×3.
