// First-party services run by the marketplace itself ("house" account).
// Each is a real webhook-mode listing that goes through the same call path as any provider.

const UA = { 'user-agent': 'service-market/1 (first-party service)' };
const fail = (message) => Object.assign(new Error(message), { upstream: true });

async function wikipediaTitles(input) {
  const n = Math.min(10, Math.max(1, Math.round(Number(input?.limit) || 5)));
  const u = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${n}&srsearch=${encodeURIComponent(String(input?.query || ''))}`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw fail(`Wikipedia returned ${r.status}`);
  const j = await r.json();
  return { titles: (j.query?.search || []).map((x) => x.title) };
}

// Domain registration check via registry RDAP (IANA bootstrap -> authoritative registry).
let bootstrap = null, bootstrapAt = 0;
async function rdapBase(tld) {
  if (!bootstrap || Date.now() - bootstrapAt > 864e5) {
    const r = await fetch('https://data.iana.org/rdap/dns.json', { headers: UA, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw fail(`IANA RDAP bootstrap returned ${r.status}`);
    const map = new Map();
    for (const [tlds, urls] of (await r.json()).services) for (const t of tlds) map.set(t.toLowerCase(), urls.find((x) => x.startsWith('https://')) || urls[0]);
    bootstrap = map; bootstrapAt = Date.now();
  }
  return bootstrap.get(tld);
}
async function checkOne(domain) {
  const name = String(domain).trim().toLowerCase().replace(/\.$/, '');
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(name)) return { domain: name, registered: null, note: 'not a valid domain name' };
  const base = await rdapBase(name.split('.').pop());
  if (!base) return { domain: name, registered: null, note: 'this TLD has no public RDAP service' };
  try {
    const r = await fetch(`${base.replace(/\/?$/, '/')}domain/${name}`, { headers: { ...UA, accept: 'application/rdap+json' }, redirect: 'follow', signal: AbortSignal.timeout(8_000) });
    if (r.status === 404) return { domain: name, registered: false };
    if (r.ok) return { domain: name, registered: true };
    return { domain: name, registered: null, note: `registry returned HTTP ${r.status}` };
  } catch { return { domain: name, registered: null, note: 'registry did not answer in time' }; }
}
async function domainCheck(input) {
  const domains = [...new Set((input?.domains || []).map(String))].slice(0, 20);
  return { results: await Promise.all(domains.map(checkOne)) };
}

export const BUILTINS = [
  {
    path: 'wikipedia-titles', run: wikipediaTitles,
    listing: {
      name: 'Wikipedia article titles', mode: 'webhook', tags: ['wikipedia', 'search', 'lookup'],
      description: 'Returns the titles of the English Wikipedia articles most relevant to a free-text query, best match first. Automated; typically answers in under a second.',
      input_schema: { type: 'object', required: ['query'], additionalProperties: false, properties: { query: { type: 'string', minLength: 1, maxLength: 300, description: 'What to look up' }, limit: { type: 'integer', minimum: 1, maximum: 10, description: 'How many titles (default 5)' } } },
      output_schema: { type: 'object', required: ['titles'], properties: { titles: { type: 'array', items: { type: 'string' } } } },
      example_input: { query: 'history of the transistor', limit: 3 },
    },
  },
  {
    path: 'domain-check', run: domainCheck,
    listing: {
      name: 'Domain name checker', mode: 'webhook', tags: ['domain', 'dns', 'availability', 'naming'],
      description: 'Checks whether domain names are registered, by asking each TLD\'s authoritative registry over RDAP. registered=false means no registration exists (the name may still be reserved or premium-priced at a registrar); null means the registry could not be asked, see note. Up to 20 domains per call.',
      input_schema: { type: 'object', required: ['domains'], additionalProperties: false, properties: { domains: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', maxLength: 253 }, description: 'Fully qualified names, e.g. example.com' } } },
      output_schema: { type: 'object', required: ['results'], properties: { results: { type: 'array', items: { type: 'object', required: ['domain', 'registered'], properties: { domain: { type: 'string' }, registered: { type: ['boolean', 'null'] }, note: { type: 'string' } } } } } },
      example_input: { domains: ['example.com', 'surely-not-registered-8271.dev'] },
      timeout_ms: 20_000,
    },
  },
];

// Human-answered listings owned by the house account (available only while someone works the inbox).
export const HOUSE_QUEUES = [
  {
    name: 'Rate an image 1-10', mode: 'queue', tags: ['human', 'image', 'rating', 'judgment'],
    description: 'A person looks at the image at the given URL and rates its overall visual quality from 1 (poor) to 10 (excellent). Answered by a human, so it is only available while a rater is online.',
    input_schema: { type: 'object', required: ['image_url'], additionalProperties: false, properties: { image_url: { type: 'string', format: 'uri', contentMediaType: 'image/*', description: 'Publicly reachable image URL' } } },
    output_schema: { type: 'object', required: ['rating'], additionalProperties: false, properties: { rating: { type: 'integer', minimum: 1, maximum: 10 } } },
    example_input: { image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png' },
    timeout_ms: 600_000,
  },
];
