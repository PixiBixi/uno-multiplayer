# Quickstart

Online UNO for two to four players, written in TypeScript. A host creates a table,
shares a six-character code or a link, and everyone plays in a browser. It is meant
to be self-hosted for a small group of friends, not to scale.

Start here, then follow the links. Every page explains why something is the way it
is, not only what it does.

## What to read next

| If you want to                                           | Read                                                 |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Understand the one decision everything else follows from | [Server authority](architecture/server-authority.md) |
| Work on the browser client                               | [The client](architecture/client.md)                 |
| Change a rule, scoring, or a table option                | [Rules and scoring](domain/rules-and-scoring.md)     |
| Touch rooms, seats, timers or reconnection               | [Room lifecycle](domain/room-lifecycle.md)           |
| Deploy it or change configuration                        | [Deploying](operations/deploying.md)                 |
| Add or fix tests                                         | [Testing](operations/testing.md)                     |

## The shape of the repository

```
packages/engine     Pure rules engine — no I/O, no networking, no dependencies
packages/protocol   Wire contract: views, events, payload schemas, bounds
apps/server         Fastify + Socket.IO orchestration, rooms, timers
apps/web            Vite + React client
e2e/                Playwright, driving real browsers against a real server
docs/superpowers/   Design specs and plans, one per feature
```

The dependency direction is strict and worth preserving: `engine` knows nothing of
`protocol`, `protocol` knows nothing of the server, and the client knows no rules.
Anything that breaks one of those is worth a second look.

## Running it

```bash
npm install
npm run verify      # lint + typecheck + unit tests, the same gate CI runs
npm run e2e         # Playwright against a real build
```

To play locally you need both halves up. The client is served by Vite and proxies
the socket handshake to the API:

```bash
npm run build                 # once, so the server has dist/ to run
npm start -w @uno/server      # API and WebSockets on http://localhost:5050
npm run dev -w @uno/web       # client with hot reload on http://localhost:5173
```

A stale `dist/` is the most common way to lose an hour here: the server runs the
last thing that was built, so a client change with no rebuild produces a client
talking to an older server. That failure has already happened once in this
project — a view arrived without a field the client expected and the table went
blank. See [Testing](operations/testing.md) for what now catches it.

## What the project is not

- **Not scalable, on purpose.** State lives in memory and there is no Redis
  adapter. Two replicas would each hold half the rooms and neither would know
  about the other, so never scale past one. See [Deploying](operations/deploying.md).
- **Not persistent.** A restart drops games in progress. That is a deliberate trade
  for having no datastore to run, back up, or pay for.
- **Not finished.** The known open items live in the README's roadmap, including a
  measured defect where a player's own hand falls below the fold on a phone.

## Where the reasoning lives

`docs/superpowers/specs/` holds one design document per significant feature —
match scoring, Blazing mode, and an analysis of what a bot and offline play would
take. They record the decisions and the alternatives that were rejected, which is
usually what you actually want when changing something.
