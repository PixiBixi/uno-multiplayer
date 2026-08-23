# UNO Multiplayer

Online UNO for 2 to 4 players, written in TypeScript. The server owns the state,
owns the rules, and sends each player only what that player is allowed to see, so
the client renders what it is given and never decides anything. Official rules plus
draw stacking, with the UNO call-out, Seven-Zero and jump-in available as optional
table rules.

**[Play it at uno.jdelgado.fr](https://uno.jdelgado.fr)** - create a table, share the
six-character code or the link, and everyone joins from a browser.

## Why this exists

This is a ground-up rewrite. The predecessor was a two-player prototype where the
server was a bare relay: it broadcast whatever game state a client sent it, without
validating anything. Any client could emit a state declaring itself the winner; both
players' full hands and the entire draw pile were sent to everyone and merely
concealed with a CSS card-back image; and the same move logic appeared sixteen times
in one 810-line function, where the copies had drifted apart.

No amount of patching fixes that shape. Here the rules live in one pure engine, the
server is the only authority, and cheating is structurally impossible rather than
discouraged - opponents' cards never cross the wire at all. See
[Server authority](openwiki/architecture/server-authority.md) for the decision the
rest of the project follows from.

## Run it locally

**Node 26**, pinned in `.nvmrc`. That is the version CI lints, covers and runs the
browser suite on, and the one the Docker image ships. It is the current release, not
yet the Active LTS: Node 26 takes that title in October 2026. `engines` says
`>=22` because the code still runs there and the test matrix proves it - but the floor
is what this supports, not what to run it on. Reading it the other way is how the
image once shipped 22 while everything else validated 24; a CI step now fails if the
Dockerfile and `.nvmrc` disagree.

```bash
npm install
npm run build                 # once, so the server has dist/ to run
npm start -w @uno/server      # API and WebSockets on http://localhost:5050
```

That runs the API alone. The client is served by Vite on its own port and proxies the
socket handshake, so add a second terminal:

```bash
npm run dev -w @uno/web       # client with hot reload on http://localhost:5173
```

Open <http://localhost:5173>. Vite forwards `/socket.io` and `/healthz` to 5050.

Port 5050 rather than 5000, because macOS Control Center binds 5000 for the AirPlay
receiver and a 5000 default fails on any Mac with AirPlay enabled.

The full script table, the third terminal you need when editing server code, and the
stale-`dist/` trap that costs an hour are in the
[quickstart](openwiki/quickstart.md).

## Deploy it

CI publishes an image on every green push to `main`, and the image published is the
one the pipeline booted and probed rather than a second build of the same source:

```bash
docker compose up --build      # then open http://localhost:5050
```

Behind an existing reverse proxy, `compose.traefik.yaml` is ready to use - replace
the hostname, the cert resolver and the network name, then:

```bash
docker compose -f compose.traefik.yaml pull
docker compose -f compose.traefik.yaml up -d
```

**No WebSocket configuration is needed.** Traefik proxies the upgrade itself, which
is verified rather than assumed: the full Playwright suite plays complete
multi-player games through a real Traefik with only four routing labels. Three
things do matter - `BEHIND_TLS=true`, no `ports:` mapping, and `external: true` on
the network.

**One replica, always.** Game state lives in memory and there is no Redis adapter, so
two processes would each hold half the rooms and neither would know about the other.
A restart drops games in progress. At a few concurrent tables that is a deliberate
trade for having no datastore to run, back up, or pay for.

Environment variables, `BEHIND_TLS` and why it defaults to false, rollback by SHA tag
and probing a live instance are in [Deploying](openwiki/operations/deploying.md).

## Documentation

The manual lives in [`openwiki/`](openwiki/quickstart.md). Every page explains why
something is the way it is, not only what it does.

| Page                                                          | What it covers                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Quickstart](openwiki/quickstart.md)                          | Repository shape, running it, the toolchain, where the reasoning lives |
| [Server authority](openwiki/architecture/server-authority.md) | The one decision everything follows from; engine invariants, the wire  |
| [The client](openwiki/architecture/client.md)                 | React layers, card themes, sound, internationalisation, accessibility  |
| [Rules and scoring](openwiki/domain/rules-and-scoring.md)     | Every rule pinned down, the four table rules, match scoring, Blazing   |
| [Room lifecycle](openwiki/domain/room-lifecycle.md)           | Rooms, seats, reconnection, timers, configuring the table              |
| [Deploying](openwiki/operations/deploying.md)                 | Docker, Traefik, configuration, the published image                    |
| [Testing](openwiki/operations/testing.md)                     | Which tool proves which claim, and the traps this suite has hit        |

Design documents live in `docs/superpowers/`: the
[design spec](docs/superpowers/specs/2026-08-04-uno-multiplayer-design.md) records the
decisions and the alternatives that were rejected, and there is one spec per
significant feature beside it. What is built and what is still open is in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Licence

ISC. See [LICENSE](LICENSE).
