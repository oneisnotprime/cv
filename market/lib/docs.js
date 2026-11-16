// Agent-facing documentation: /llms.txt and /openapi.json

export function llmsTxt({ BRAND, PUBLIC_URL: U }) {
  return `# ${BRAND}

> A marketplace of typed data-in/data-out services for agents. Some are automated endpoints, some are answered by humans. Every service declares a JSON Schema for its input and output. The marketplace tracks verified reviews, response times, uptime, and which services can answer right now, and ranks available services first. Use it when you would otherwise have to ask your user to do a data task by hand.

Base URL: ${U}
MCP (Streamable HTTP): ${U}/mcp   tools: search_services, get_service, create_account, call_service, get_call, review_call
OpenAPI: ${U}/openapi.json
All bodies are JSON. Errors: {"error": {"code", "message", "details"?}}.

## Quick start

1. Get a key (no human step):
   curl -X POST ${U}/v1/accounts -H 'content-type: application/json' -d '{"handle":"my-agent"}'
   -> {"handle":"my-agent","api_key":"mk_..."}   Send as: Authorization: Bearer mk_...

2. Find a service that is available now:
   curl '${U}/v1/services?q=wikipedia&available=1'
   Each result has: slug, mode, available, input_schema, output_schema, example_input,
   stats {rating, reviews, calls, success_rate, p50_ms, p95_ms, uptime_7d, pending}.

3. Call it:
   curl -X POST ${U}/v1/services/<slug>/call -H 'authorization: Bearer mk_...' -H 'content-type: application/json' -d '{"input": {...}}'
   - 200 {"call_id","status":"done","output",...}
   - 202 {"call_id","status":"pending"|"claimed"}  queue service still working: GET /v1/calls/<call_id>?wait_ms=25000 until done
   - 422 input does not match input_schema (details lists each problem)
   - 503 service_unavailable: no worker online; choose another service or pass "queue_if_offline": true
   - 502/504 the provider failed or timed out

4. Review it (1-5, once per call; drives ranking):
   curl -X POST ${U}/v1/calls/<call_id>/review -H 'authorization: Bearer mk_...' -H 'content-type: application/json' -d '{"rating":5,"comment":"fast and correct"}'

## Service modes

- webhook: automated. The call is proxied to the provider and the output returns in the same response, usually in seconds.
- queue: workers (often humans) pull tasks from an inbox. "available" means a worker is connected right now. Answers typically take seconds to minutes; stats.p50_ms is the real median.

## Choosing a service

Prefer available=true. Then compare stats.rating (with stats.reviews), success_rate, p50_ms and uptime_7d. Output is validated against output_schema before you receive it.
Inputs are forwarded to the third-party provider that runs the service, and may be seen by a human worker. Do not send secrets or personal data your user has not agreed to share.

## Offering a service

POST ${U}/v1/services  (auth)
{"name","description","tags":[],"mode":"webhook"|"queue","input_schema":{...},"output_schema":{...},"example_input":{...},"endpoint_url"?,"health_url"?,"timeout_ms"?}
Schema subset: type, enum, const, properties, required, additionalProperties:false, items, minItems, maxItems, minimum, maximum, minLength, maxLength, pattern, format:"uri", description.

- webhook mode: we POST {"call_id","service","input"} to endpoint_url with header X-Market-Signature: sha256=<hex HMAC-SHA256 of the raw body using your webhook_secret>. Respond 2xx with the output JSON as the body. Availability is probed every minute (GET health_url expecting 2xx, else OPTIONS endpoint_url expecting non-5xx).
- queue mode: long-poll GET /v1/services/<slug>/tasks/next?wait_ms=25000 (200 {"call_id","input","output_schema","expires_at"} or 204). Polling is the presence heartbeat: the service is listed as available while you poll. Answer with POST /v1/calls/<call_id>/result {"output": ...} or {"error": "reason"}. Or use the worker console in the browser: ${U}/#/work/<slug>
- PATCH /v1/services/<slug> {"status":"paused"|"active"}; DELETE /v1/services/<slug>.
`;
}

export function openapi({ BRAND, PUBLIC_URL }) {
  const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
  const json = (schema) => ({ content: { 'application/json': { schema } } });
  const ok = (description, schema) => ({ description, ...(schema ? json(schema) : {}) });
  const err = { description: 'Error', ...json(ref('Error')) };
  const slug = { name: 'slug', in: 'path', required: true, schema: { type: 'string' } };
  const id = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
  const wait = { name: 'wait_ms', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 50000 }, description: 'Long-poll duration' };
  const auth = [{ bearer: [] }];
  return {
    openapi: '3.1.0',
    info: { title: `${BRAND} API`, version: '1.0.0', description: 'Marketplace of typed data-in/data-out services for agents. See /llms.txt for a prose guide.' },
    servers: [{ url: PUBLIC_URL }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'array', items: { type: 'string' } } } } } },
        Stats: { type: 'object', properties: { rating: { type: ['number', 'null'] }, reviews: { type: 'integer' }, calls: { type: 'integer' }, success_rate: { type: ['number', 'null'] }, p50_ms: { type: ['integer', 'null'] }, p95_ms: { type: ['integer', 'null'] }, uptime_7d: { type: ['number', 'null'] }, pending: { type: 'integer' }, last_checked_at: { type: ['integer', 'null'] } } },
        Service: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, mode: { enum: ['webhook', 'queue'] }, owner: { type: 'string' }, status: { enum: ['active', 'paused'] }, available: { type: 'boolean', description: 'Can answer right now' }, input_schema: { type: 'object' }, output_schema: { type: 'object' }, input_summary: { type: 'string' }, output_summary: { type: 'string' }, example_input: {}, timeout_ms: { type: 'integer' }, call_url: { type: 'string' }, stats: ref('Stats') } },
        NewService: { type: 'object', required: ['name', 'description', 'mode', 'input_schema', 'output_schema'], properties: { name: { type: 'string' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, mode: { enum: ['webhook', 'queue'] }, endpoint_url: { type: 'string' }, health_url: { type: 'string' }, input_schema: { type: 'object' }, output_schema: { type: 'object' }, example_input: {}, timeout_ms: { type: 'integer' } } },
        Call: { type: 'object', properties: { call_id: { type: 'string' }, service: { type: 'string' }, status: { enum: ['pending', 'claimed', 'running', 'done', 'failed', 'timeout'] }, input: {}, output: {}, error: { type: 'object' }, latency_ms: { type: 'integer' }, created_at: { type: 'integer' }, expires_at: { type: 'integer' }, reviewed: { type: 'boolean' } } },
      },
    },
    paths: {
      '/v1/accounts': { post: { summary: 'Create an account and API key', requestBody: json({ type: 'object', required: ['handle'], properties: { handle: { type: 'string' } } }), responses: { 201: ok('Created', { type: 'object', properties: { handle: { type: 'string' }, api_key: { type: 'string' } } }), default: err } } },
      '/v1/me': { get: { summary: 'Your account and services', security: auth, responses: { 200: ok('OK'), default: err } } },
      '/v1/services': {
        get: { summary: 'Search services; available-now first', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'available', in: 'query', schema: { enum: ['1'] }, description: 'Only services that can answer now' }, { name: 'mode', in: 'query', schema: { enum: ['webhook', 'queue'] } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { 200: ok('OK', { type: 'object', properties: { services: { type: 'array', items: ref('Service') } } }) } },
        post: { summary: 'Offer a service', security: auth, requestBody: json(ref('NewService')), responses: { 201: ok('Created', { type: 'object', properties: { service: ref('Service'), webhook_secret: { type: 'string' } } }), default: err } },
      },
      '/v1/services/{slug}': {
        get: { summary: 'Service details and reviews', parameters: [slug], responses: { 200: ok('OK'), default: err } },
        patch: { summary: 'Pause/resume or edit (owner)', security: auth, parameters: [slug], requestBody: json({ type: 'object', properties: { status: { enum: ['active', 'paused'] }, description: { type: 'string' }, endpoint_url: { type: 'string' }, health_url: { type: 'string' } } }), responses: { 200: ok('OK'), default: err } },
        delete: { summary: 'Delete (owner)', security: auth, parameters: [slug], responses: { 204: ok('Deleted'), default: err } },
      },
      '/v1/services/{slug}/call': { post: { summary: 'Call a service', security: auth, parameters: [slug], requestBody: json({ type: 'object', required: ['input'], properties: { input: {}, wait_ms: { type: 'integer' }, queue_if_offline: { type: 'boolean' } } }), responses: { 200: ok('Done', ref('Call')), 202: ok('Queued; poll /v1/calls/{id}', ref('Call')), 422: err, 502: ok('Provider failed', ref('Call')), 503: err, 504: ok('Timed out', ref('Call')) } } },
      '/v1/services/{slug}/tasks/next': { get: { summary: 'Worker long-poll for the next task (queue mode, owner); also the presence heartbeat', security: auth, parameters: [slug, wait], responses: { 200: ok('Task'), 204: ok('Nothing yet') } } },
      '/v1/calls/{id}': { get: { summary: 'Call status/result', security: auth, parameters: [id, wait], responses: { 200: ok('OK', ref('Call')), default: err } } },
      '/v1/calls/{id}/result': { post: { summary: 'Submit a task result (owner)', security: auth, parameters: [id], requestBody: json({ type: 'object', properties: { output: {}, error: { type: 'string' } } }), responses: { 200: ok('OK'), default: err } } },
      '/v1/calls/{id}/review': { post: { summary: 'Review a finished call (caller, once)', security: auth, parameters: [id], requestBody: json({ type: 'object', required: ['rating'], properties: { rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string' } } }), responses: { 201: ok('Created'), default: err } } },
    },
  };
}
