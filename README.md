# nuxt-chat

> **Role in the zoo:** project `nuxt-chat` of [oxzoo-live](https://github.com/saurav-codes/oxzoo-live-control/blob/main/zoo/README.md#projects), deployed with ox on server s4 at https://nuxt-chat.s4.zoo.sorv.dev. The contract it follows is [DESIGN.md](https://github.com/saurav-codes/oxzoo-live-control/blob/main/zoo/DESIGN.md).

Nuxt 4 with server rendering on s4: a small live chat. History is a Redis list
rendered on the server; new messages travel through Redis pub/sub and reach the
browser over Server-Sent Events.

## What it proves

- Proof level P2: real round trips against the Redis that ox provides.
- `redis`: SET, GET, DEL of a random key, plus the history length.
- `pubsub`: a fresh subscriber connection subscribes to a random channel, the
  command connection publishes, and the message must arrive within 2 s.
- `sse`: the app opens its own `/api/chat/stream` over `127.0.0.1:$PORT`, posts a
  message through `POST /api/chat`, sees it come back on the stream, then removes
  it from history.

## ox features exercised

- Zero-config Nuxt detection: `npm ci`, `npm run build`, start
  `node .output/server/index.mjs` (Nitro reads `HOST` and `PORT`).
- Node pinned by `package.json` `engines.node` (24).
- The built-in Redis service, detected from the `ioredis` dependency, with
  `REDIS_URL` provided by ox.

## Endpoints

| Path | What |
|------|------|
| `GET /` | the chat page, history server-rendered |
| `GET /api/chat` | the last 100 messages |
| `POST /api/chat` | `{"name", "text"}`; name 1 to 32 letters, digits, space, `_ . -`; text 1 to 500 characters; body cap 2 KB; 5 posts per 10 s per IP |
| `GET /api/chat/stream` | SSE: `ready`, then `message` events; `ping` every 15 s; at most 100 open streams per process (503 after) |
| `GET /_zoo/health`, `GET /_zoo/probe` | the zoo contract (Nitro server routes in `server/routes/_zoo/`) |

History is `LPUSH` plus `LTRIM 0 99` on `chat:history` in one transaction with the
`PUBLISH` to `chat:room`. The client IP for the rate limit is the last
`X-Forwarded-For` entry (the one the local proxy adds). The name `zoo-probe` is
reserved for the app's own loopback self check, and the page hides it.

## Variables

| Name | Source | Role in probe |
|------|--------|---------------|
| `PORT`, `HOST`, `PUBLIC_HOST`, `OX_ENV`, `OX_RELEASE` | provided by ox | none |
| `REDIS_URL` | provided by ox (redis service) | plain, fp only |
| `ZOO_PANEL_ORIGIN` | yours, `https://zoo-control.s1.zoo.sorv.dev` | plain |

## Run and test

```sh
npm ci
npm test       # zoo-sig vectors, verify reasons, CORS, trace ids, ring, rate limit, probe lock, message validation, client IP, history decode
npm run build
PORT=3000 HOST=127.0.0.1 REDIS_URL=redis://127.0.0.1:6379/0 node .output/server/index.mjs
```

Local result (2026-10-09, Redis 8 on a random port): `npm test` 11 of 11 pass;
the build succeeds; the probe is `ok: true` for all three checks; 5 posts pass
and the 6th is 429; text over 500 characters, a body over 2 KB and the reserved
name from a forwarded request are rejected; 110 posts leave 100 in history; the
101st stream gets 503 and the count drops back when streams close; a stream sees
`ping` after 15 s; with Redis stopped the probe fails all three checks and
`POST` answers 503. In a browser the page goes live, a sent message shows, and a
message posted from elsewhere arrives over SSE.

## ox check

```console
ox check ~/oxzoo-live/nuxt-chat (manifest: none)

  app.start                  node .output/server/index.mjs                        detected:nuxt.config.ts
  build.install              npm ci                                               detected:package-lock.json
  build.commands[0]          npm run build                                        detected:package.json
  tools.node                 24                                                   detected:package.json
  services.redis             redis 8 (only for this project)                      detected:package.json

  Provided by ox: PORT, HOST, OX_ENV, OX_PROJECT, OX_RELEASE, OX_DATA_DIR, PUBLIC_URL, PUBLIC_HOST, REDIS_URL
  Set on the dashboard before the first deploy: ZOO_PANEL_ORIGIN

Ready to deploy.
```
