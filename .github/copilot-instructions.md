# AIMETON Agent GitHub Execution Contract

Канонический источник: `Dimar4713/aimeton-architecture/docs/operations/AGENT_GITHUB_EXECUTION_BRIDGE.md`.

## Обязательный порядок

1. Сначала использовать доступный GitHub connector/API.
2. Если прямой операции нет — проверить AIMETON MCP, REST/GraphQL или `gh` через доверенный контур.
3. Для отсутствующего `workflow_dispatch` разрешён только строгий owner-only `issue_comment` bridge: allow-listed Issue, точная команда, exact 40-char SHA, проверка commit, минимальные permissions и fail-closed поведение.
4. Любое заявленное действие подтверждать read-back: PR/commit, workflow/job/log, artifact и runtime/deployed SHA, когда применимо.
5. Не просить владельца о ручном UI-действии, пока не исчерпаны машинные каналы.
6. Не писать «продолжаю» и не останавливаться: держать очередь минимум из текущей и двух следующих однозначных задач и двигаться до реального критического блокера.
7. Не раскрывать секреты, не создавать расходы и не менять production, бюджеты, юридические обязательства, OCC-49 или архитектурные инварианты без явного решения владельца.

Для Voice Agent consequential actions, звонки, отправка сообщений и работа с реальными контактами требуют отдельного разрешения и evidence; режим проверки по умолчанию — sandbox/observe-only.
