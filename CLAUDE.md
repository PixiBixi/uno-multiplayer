# uno-multiplayer

Online UNO for two to four players. TypeScript monorepo, server-authoritative,
self-hosted for a small group.

## Ground rules for working here

- **Code, comments and commit messages in English.** Conversation may be in French.
- **`npm run verify` before every commit** — lint, typecheck and unit tests. Check
  the exit code; piping to `tail` swallows it, which has hidden a broken typecheck
  in a commit before.
- **Conventional Commits, one commit per scope.** Do not bundle unrelated changes.
- Avoid backticks in commit messages written inline in a shell — they get executed
  as command substitution. Use `git commit -F <file>`.

## The invariants worth protecting

- `packages/engine` is **pure**: no I/O, no networking, no dependencies. It is what
  makes the rules testable, replayable, and reusable in a browser.
- **The client knows no rules.** The server ships `legalMoves` inside each view; the
  client renders and emits intents. Cheating is structurally impossible because
  opponents' hands never cross the wire.
- **`Room` is synchronous and timer-free.** Timers live in `RoomManager` behind an
  injectable interface, along with the clock source, so tests never wait.
- **Member seat number == engine seat index.** Scores and statistics are indexed by
  seat; breaking this has already cost a player their entire view of a game.

## Traps that have already cost time here

- Testing both ends of a chain proves nothing about the wire between them. A new
  client action needs a protocol type, a Zod schema, a `socket.on` handler **and**
  the client emit — the handler is the piece that gets forgotten.
- Judge layout by measuring geometry or computed styles in a real browser, not by
  reading a screenshot, and sample after transitions settle.
- A stale `dist/` means a new client talking to an old server.
- `card.kind === 'wild' || card.kind === 'wild4'` written inline does not narrow the
  union. Use `isWild`.

## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:

- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.
