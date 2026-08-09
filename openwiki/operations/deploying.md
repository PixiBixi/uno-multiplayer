# Deploying

A multi-stage `Dockerfile` producing a non-root image with a `HEALTHCHECK`, serving
both the API and the built client from one process.

```bash
docker compose up --build      # then open http://localhost:5050
```

## Behind Traefik

`compose.traefik.yaml` is ready to use — replace the hostname, the cert resolver
and the network name.

**No WebSocket configuration is needed.** Traefik proxies the upgrade itself,
unlike nginx where omitting the `Upgrade` and `Connection` headers is the classic
way to break Socket.IO. That is verified rather than assumed: the full Playwright
suite plays complete multi-player games through a real Traefik with only four
routing labels and nothing else.

Three things that do matter:

- **`BEHIND_TLS=true`.** Traefik terminates TLS, so the container speaks plain HTTP
  while players arrive over HTTPS. Without the flag the app drops HSTS.
- **No `ports:` mapping.** Traefik reaches the container over the shared network;
  publishing 5050 on the host adds a plain-HTTP way in that bypasses TLS.
- **`external: true` on the network.** Without it compose creates a second network
  Traefik never watches, and every request 404s.

On **Docker 29 or newer**, Traefik releases before v3.6 fail to read the Docker
provider at all — `client version 1.24 is too old` in the Traefik log, and every
route 404s with nothing in the app's own log. Upgrade Traefik or set
`DOCKER_API_VERSION=1.44` on it.

## `BEHIND_TLS` and why it defaults to false

It governs the two security headers that assume TLS: HSTS, and the CSP's
`upgrade-insecure-requests`.

It defaults to `false` because those headers do not merely add nothing without TLS,
they **break the app**. `upgrade-insecure-requests` rewrites every asset request to
`https://`, so a server reached at `http://192.168.1.20:5050` answers with CSS and
JS URLs that have no TLS behind them: `ERR_SSL_PROTOCOL_ERROR`, and a blank page.
Both are helmet defaults, switched off unless the flag says otherwise.

## Configuration

`apps/server/src/config.ts` parses the environment with Zod and is the one place
allowed to throw: a misconfigured environment must stop the boot rather than
surface later as confusing runtime behaviour.

| Variable                         | Default                 | Purpose                                                                                                                        |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                           | `5050`                  | Not 5000 — macOS Control Center binds that for AirPlay                                                                         |
| `HOST`                           | `0.0.0.0`               | Listen address                                                                                                                 |
| `CORS_ORIGIN`                    | empty                   | Comma-separated allowlist; empty means same-origin only                                                                        |
| `BEHIND_TLS`                     | `false`                 | See above. Only `'true'` or `'false'` — a security flag that read `TRUE` as false would be worse than one that refuses to boot |
| `GRACE_PERIOD_MS`                | `60000`                 | How long a disconnected player keeps their seat                                                                                |
| `MAX_ROOMS`                      | `500`                   | Cap on concurrent rooms, bounding memory                                                                                       |
| `STATIC_ROOT`                    | `/app/web` in the image | Built client to serve; empty serves the API alone                                                                              |
| `MOVE_BURST` / `MOVE_PER_SECOND` | `20` / `2`              | Move rate limit, sized for a human                                                                                             |
| `CHAT_BURST` / `CHAT_PER_SECOND` | `5` / `0.5`             | Chat rate limit, tighter                                                                                                       |
| `LOG_LEVEL`                      | `info`                  | pino level                                                                                                                     |

## One replica, always

Game state lives in memory. There is no Redis adapter and no sticky-session setup,
so **never scale past a single replica** — two would each hold half the rooms and
neither would know about the other. Traefik makes scaling a one-line change, which
is exactly why the compose file says so out loud.

A restart drops games in progress. At a few concurrent tables that is a deliberate
trade for having no datastore to run, back up, or pay for.

## Probing a deployment

The e2e suite runs against an already-running instance, which proves the thing that
actually ships plays a game rather than merely serving files:

```bash
E2E_BASE_URL="https://uno.example.com" npx playwright test
```

One spec skips itself in that mode. It floods the chat to test the scroll
behaviour, which needs a raised `CHAT_BURST` that only the suite-managed server
gets — against a deployed instance the limiter correctly stops it at five messages.
The skip states its reason rather than weakening the assertion.

## Building the image

CI builds and probes the image on every push, but does **not** publish it to a
registry, so deploying means building on the server. Note `.dockerignore` needs
`**/`-prefixed patterns: a bare `*.tsbuildinfo` matches only the context root, so
nested build info once reached the image while `dist/` was excluded, and
`tsc --build` then reported every project "up to date" against output that was not
there. CI could never catch that — a fresh checkout has no build info.
