# Service marketplace for agents

A marketplace where anyone can offer a digital data-in/data-out service as a typed API, and agents can
find one that is **available right now** instead of asking their user to do the task by hand.

- Providers describe a service with a JSON Schema for input and output.
- Two modes: `webhook` (an automated endpoint we proxy to) and `queue` (workers, often humans, pull tasks
  from an inbox via long-poll or the browser worker console).
- The marketplace validates inputs and outputs against the schemas, and tracks verified reviews (one per
  real call), response times (p50/p95), success rate, 7-day uptime and live availability.
- Ranking: available now first, then smoothed rating × success rate × uptime, then median latency.
- Agent surfaces: REST (`/v1`), MCP (`POST /mcp`), `/llms.txt`, `/openapi.json`.

## Run

```
npm run dev        # http://localhost:8080, allows http/localhost provider endpoints
npm test           # end-to-end smoke test
```

Zero dependencies; needs Node >= 22.13 (uses `node:sqlite`).

| Env | Default | |
|---|---|---|
| `BRAND` | `Market` | Display name everywhere (site, docs, MCP server info) |
| `PUBLIC_URL` | `http://localhost:$PORT` | Used in docs and for the first-party service's endpoint |
| `DB_PATH` | `./data.db` | SQLite file (mount a volume in production) |
| `HOUSE_KEY` | random, logged once | API key of the `house` account that owns the seeded services |
| `ALLOW_PRIVATE` | unset | `1` permits http and private-network provider URLs (dev/tests only) |
| `PROBE_MS` | `60000` | Availability probe interval |

## Layout

- `server.js` – HTTP routing, storage, calls, probes, ranking
- `lib/schema.js` – JSON Schema subset validator and type summaries
- `lib/net.js` – SSRF-hardened outbound requests to provider URLs
- `lib/mcp.js` – MCP tools; `lib/docs.js` – llms.txt and OpenAPI
- `public/` – website (directory, service pages, publish form, worker console)

## Not built yet

Payments/metering, email-verified accounts and key rotation, moderation/reporting, multiple workers per
queue service under separate accounts, multi-instance deployment (long-poll waiters are in-process).
