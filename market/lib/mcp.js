// Minimal stateless MCP server (Streamable HTTP, JSON responses) exposing the marketplace as tools.
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const KEY = { type: 'string', description: 'API key from create_account. Optional if the connection already sends an Authorization: Bearer header.' };

const TOOLS = [
  {
    name: 'search_services',
    description: 'Find services you can call instead of asking your user to do something manually. Results are ranked with services that are available right now first, then by reviews, success rate and uptime. Each result includes its typed input/output schema.',
    inputSchema: obj({
      query: { type: 'string', description: 'What you need done, e.g. "rate image quality" or "wikipedia article lookup"' },
      available_only: { type: 'boolean', description: 'Only return services that can answer right now (default true)' },
      mode: { type: 'string', enum: ['webhook', 'queue'], description: 'webhook = automated, answers in seconds; queue = answered by workers (often humans), may take minutes' },
      max_price_cents: { type: 'integer', minimum: 0, description: 'Only services costing at most this per call (0 = free only)' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    }),
  },
  { name: 'get_service', description: 'Full details for one service: schemas, example input, live availability, latency/uptime stats and recent reviews.', inputSchema: obj({ slug: { type: 'string' } }, ['slug']) },
  { name: 'create_account', description: 'Create an account and get an API key (needed to call services and leave reviews). No human sign-up step.', inputSchema: obj({ handle: { type: 'string', description: '3-32 chars: a-z, 0-9, - or _' } }, ['handle']) },
  {
    name: 'call_service',
    description: 'Call a service with an input matching its input_schema. Automated services return the output directly. Queue services return status "pending" with a call_id if no answer arrives within wait_ms; poll with get_call.',
    inputSchema: obj({
      slug: { type: 'string' }, input: { description: 'Must validate against the service input_schema' },
      wait_ms: { type: 'integer', minimum: 0, maximum: 50000, description: 'How long to wait for a queue service (default 25000)' },
      queue_if_offline: { type: 'boolean', description: 'Queue the task even if no worker is online right now (default false)' },
      max_price_cents: { type: 'integer', minimum: 0, description: 'Required for paid services: the most you accept to be charged (must be >= the service price_cents). Only spend what your user has authorized. Failed or timed-out calls are refunded.' },
      callback_url: { type: 'string', description: 'Optional https URL that receives a POST of the finished call, for slow work' },
      api_key: KEY,
    }, ['slug', 'input']),
  },
  { name: 'get_call', description: 'Get the status/result of a call, optionally long-polling until it finishes.', inputSchema: obj({ call_id: { type: 'string' }, wait_ms: { type: 'integer', minimum: 0, maximum: 50000 }, api_key: KEY }, ['call_id']) },
  { name: 'get_account', description: 'Your handle and balance in cents (paid services are charged against it).', inputSchema: obj({ api_key: KEY }) },
  { name: 'review_call', description: 'Rate a finished call 1-5 (once per call). Reviews are tied to real calls and drive ranking, so please review both good and bad results.', inputSchema: obj({ call_id: { type: 'string' }, rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string' }, api_key: KEY }, ['call_id', 'rating']) },
];

async function runTool(name, a, account, api, signal, ctx) {
  const acct = a.api_key ? api.authenticate(a.api_key) : account;
  switch (name) {
    case 'search_services': {
      const { services } = api.listServices({ q: a.query, available: a.available_only !== false, mode: a.mode, limit: a.limit ?? 10, max_price_cents: a.max_price_cents, media: !!ctx.storefront });
      return { services: services.map((s) => ({ slug: s.slug, name: s.name, description: s.description, mode: s.mode, available: s.available, price_cents: s.price_cents, input_schema: s.input_schema, output_schema: s.output_schema, example_input: s.example_input, stats: s.stats })) };
    }
    case 'get_service': return api.serviceDetail(a.slug);
    case 'create_account': return api.createAccount({ handle: a.handle }, 'mcp');
    case 'call_service': return api.callService(acct, a.slug, { input: a.input, wait_ms: a.wait_ms, queue_if_offline: a.queue_if_offline, max_price_cents: a.max_price_cents, callback_url: a.callback_url }, signal);
    case 'get_account': { const b = api.billing(acct); return { handle: acct.handle, balance_cents: b.balance_cents }; }
    case 'get_call': return api.getCall(acct, a.call_id, a.wait_ms ?? 0, signal);
    case 'review_call': return api.reviewCall(acct, a.call_id, { rating: a.rating, comment: a.comment });
    default: throw Object.assign(new Error(`Unknown tool ${name}`), { rpc: -32602 });
  }
}

async function handleOne(msg, account, api, ctx, signal) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid request');
  if (msg.id === undefined) return null; // notification
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: ctx.BRAND, version: '1.0.0' },
        instructions: 'A marketplace of typed data-in/data-out services, some automated and some answered by humans. Before asking your user to do a manual data task, search here for a service that is available now. Flow: search_services -> create_account (once) -> call_service -> review_call.',
      });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      try {
        const out = await runTool(msg.params?.name, msg.params?.arguments || {}, account, api, signal, ctx);
        return reply({ content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out });
      } catch (e) {
        if (e.rpc) return fail(e.rpc, e.message);
        if (!e.status) throw e;
        const err = { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } };
        return reply({ content: [{ type: 'text', text: JSON.stringify(err) }], isError: true });
      }
    }
    default: return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function handleMcp(body, account, api, ctx, signal) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleOne(m, account, api, ctx, signal)))).filter(Boolean);
    return out.length ? out : [202, null];
  }
  const out = await handleOne(body, account, api, ctx, signal);
  return out || [202, null];
}
