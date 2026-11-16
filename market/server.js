// Marketplace of typed data-in/data-out services for agents.
// Zero dependencies: node:http + node:sqlite (Node >= 22.13).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { validate, checkSchema, summarize } from './lib/schema.js';
import { safeRequest, checkUrl } from './lib/net.js';
import { handleMcp } from './lib/mcp.js';
import { openapi, llmsTxt } from './lib/docs.js';
import { BUILTINS, HOUSE_QUEUES } from './lib/builtin.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const BRAND = process.env.BRAND || 'Market';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DB_PATH = process.env.DB_PATH || path.join(DIR, 'data.db');
const PROBE_MS = Number(process.env.PROBE_MS || 60_000);
const PRESENCE_MS = 30_000; // a queue service is "available" if a worker polled this recently
const WEEK = 7 * 864e5;
const FILES_DIR = process.env.FILES_DIR || path.join(path.dirname(DB_PATH), 'files');
const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_STORE = Number(process.env.MAX_STORE_MB || 700) * 1024 * 1024;
// Deliverable types workers may upload. No HTML/SVG: nothing served from /files can run script.
const UPLOAD_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/midi': 'mid',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'application/pdf': 'pdf', 'text/plain': 'txt',
};
const EXT_TYPES = Object.fromEntries(Object.entries(UPLOAD_TYPES).map(([t, e]) => [e, t]).reverse());
fs.mkdirSync(FILES_DIR, { recursive: true });
const FEE_PCT = Number(process.env.FEE_PERCENT || 10);
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WH = process.env.STRIPE_WEBHOOK_SECRET || '';
const PAYMENTS = !!(STRIPE_KEY && STRIPE_WH);
const ADMIN = 'house';
const REVIEW_MS = Number(process.env.REVIEW_MS || 72 * 3600_000); // buyer's window to accept, ask for changes or dispute
// Extra hostnames this deployment answers on as the main site (docs and links use the host you came in on).
const SITE_HOSTS = new Set((process.env.SITE_HOSTS || 'knotto.com,www.knotto.com').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
// A second front door on the same backend: only human-made media listings, different name and copy.
const STOREFRONT = {
  key: 'creative',
  hosts: new Set((process.env.STOREFRONT_HOSTS || 'makeartforme.com,www.makeartforme.com').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)),
  brand: process.env.STOREFRONT_BRAND || 'Make Art For Me',
  tagline: 'Human-made art, music and video, commissioned by people and their agents.',
};

// ---------- storage ----------
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, handle TEXT UNIQUE NOT NULL, key_hash TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, owner_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL, description TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
  mode TEXT NOT NULL, endpoint_url TEXT, health_url TEXT, webhook_secret TEXT,
  input_schema TEXT NOT NULL, output_schema TEXT NOT NULL, example_input TEXT,
  timeout_ms INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL,
  last_seen_at INTEGER, probe_ok INTEGER, last_probe_at INTEGER,
  rating REAL, reviews_n INTEGER NOT NULL DEFAULT 0, calls_n INTEGER NOT NULL DEFAULT 0,
  success_rate REAL, p50_ms INTEGER, p95_ms INTEGER, uptime_7d REAL);
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY, service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  caller_id INTEGER NOT NULL REFERENCES accounts(id), input TEXT NOT NULL, output TEXT, error TEXT,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER, completed_at INTEGER,
  expires_at INTEGER NOT NULL, latency_ms INTEGER);
CREATE INDEX IF NOT EXISTS calls_svc ON calls(service_id, status, created_at);
CREATE TABLE IF NOT EXISTS probes (
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE, at INTEGER NOT NULL, ok INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS probes_svc ON probes(service_id, at);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, call_id TEXT UNIQUE NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  caller_id INTEGER NOT NULL REFERENCES accounts(id), rating INTEGER NOT NULL, comment TEXT, created_at INTEGER NOT NULL);
`);
const addCol = (table, col, def) => { if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); };
addCol('accounts', 'balance_cents', 'INTEGER NOT NULL DEFAULT 0');
addCol('accounts', 'earned_cents', 'INTEGER NOT NULL DEFAULT 0');
addCol('services', 'price_cents', 'INTEGER NOT NULL DEFAULT 0');
addCol('calls', 'price_cents', 'INTEGER NOT NULL DEFAULT 0');
addCol('calls', 'settled', 'INTEGER NOT NULL DEFAULT 0');
addCol('calls', 'callback_url', 'TEXT');
addCol('calls', 'claimed_by', 'INTEGER');
addCol('calls', 'payment', 'TEXT');
addCol('calls', 'release_at', 'INTEGER');
addCol('calls', 'revisions_used', 'INTEGER NOT NULL DEFAULT 0');
addCol('calls', 'revision_note', 'TEXT');
addCol('calls', 'dispute_reason', 'TEXT');
addCol('calls', 'disputed_at', 'INTEGER');
addCol('services', 'samples', "TEXT NOT NULL DEFAULT '[]'");
addCol('services', 'revisions', 'INTEGER NOT NULL DEFAULT 1');
db.exec(`
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), at INTEGER NOT NULL,
  kind TEXT NOT NULL, amount_cents INTEGER NOT NULL, call_id TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS ledger_acct ON ledger(account_id, at);
CREATE TABLE IF NOT EXISTS workers (
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE, account_id INTEGER NOT NULL REFERENCES accounts(id),
  added_at INTEGER NOT NULL, PRIMARY KEY (service_id, account_id));
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES accounts(id), reason TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', UNIQUE (service_id, reporter_id));
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), amount_cents INTEGER NOT NULL,
  destination TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
`);
const q = (sql) => db.prepare(sql);
const now = () => Date.now();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rand = (n) => crypto.randomBytes(n).toString('hex');

// ---------- errors / helpers ----------
class Err extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
const need = (cond, status, code, message, details) => { if (!cond) throw new Err(status, code, message, details); };
const str = (v, name, min, max) => {
  need(typeof v === 'string' && v.trim().length >= min && v.length <= max, 422, 'invalid_field', `${name} must be a string of ${min}-${max} characters`);
  return v.trim();
};
const clamp = (v, lo, hi, dflt) => { const n = v == null || v === '' ? NaN : Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt; };

const buckets = new Map(); // fixed-window rate limiting
function limit(key, max, windowMs) {
  const t = now();
  let b = buckets.get(key);
  if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
  need(++b.n <= max, 429, 'rate_limited', `Too many requests; retry in ${Math.ceil((b.reset - t) / 1000)}s`);
}
setInterval(() => { const t = now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60_000).unref();

// ---------- presentation ----------
function isAvailable(s, t = now()) {
  if (s.status !== 'active') return false;
  if (s.mode === 'queue') return !!s.last_seen_at && t - s.last_seen_at < PRESENCE_MS;
  return s.probe_ok === 1 && !!s.last_probe_at && t - s.last_probe_at < PROBE_MS * 3;
}
const ownerHandle = q('SELECT handle FROM accounts WHERE id = ?');
const pendingCount = q(`SELECT count(*) n FROM calls WHERE service_id = ? AND status IN ('pending','claimed')`);
const presence = new Map(); // service id -> Map<account id, last poll ms> (who is working an inbox right now)
function workersOnline(id, t = now()) { let n = 0; for (const at of presence.get(id)?.values() || []) if (t - at < PRESENCE_MS) n++; return n; }
// Which kinds of media file a schema delivers, from contentMediaType annotations.
function mediaKinds(schema, out = new Set(), depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 8) return out;
  const m = /^(image|audio|video)\//.exec(schema.contentMediaType || '');
  if (m) out.add(m[1]);
  for (const sub of Object.values(schema.properties || {})) mediaKinds(sub, out, depth + 1);
  if (schema.items) mediaKinds(schema.items, out, depth + 1);
  return out;
}
function present(s) {
  const input_schema = JSON.parse(s.input_schema), output_schema = JSON.parse(s.output_schema);
  return {
    slug: s.slug, name: s.name, description: s.description, tags: JSON.parse(s.tags), mode: s.mode,
    owner: ownerHandle.get(s.owner_id)?.handle, status: s.status, available: isAvailable(s),
    input_schema, output_schema, input_summary: summarize(input_schema), output_summary: summarize(output_schema),
    example_input: s.example_input ? JSON.parse(s.example_input) : null, timeout_ms: s.timeout_ms, created_at: s.created_at,
    price_cents: s.price_cents, media: [...mediaKinds(output_schema)], samples: JSON.parse(s.samples), revisions: s.mode === 'queue' ? s.revisions : 0,
    call_url: `${PUBLIC_URL}/v1/services/${s.slug}/call`,
    stats: {
      rating: s.rating, reviews: s.reviews_n, calls: s.calls_n, success_rate: s.success_rate,
      p50_ms: s.p50_ms, p95_ms: s.p95_ms, uptime_7d: s.uptime_7d, pending: pendingCount.get(s.id).n, workers_online: s.mode === 'queue' ? workersOnline(s.id) : 0,
      last_checked_at: s.mode === 'queue' ? s.last_seen_at : s.last_probe_at,
    },
  };
}
function presentCall(c, slug) {
  const svc = q('SELECT revisions, mode FROM services WHERE id = ?').get(c.service_id);
  return {
    call_id: c.id, service: slug, status: c.status, input: JSON.parse(c.input),
    ...(c.output != null ? { output: JSON.parse(c.output) } : {}),
    ...(c.error ? { error: { code: 'call_failed', message: c.error } } : {}),
    ...(c.latency_ms != null ? { latency_ms: c.latency_ms } : {}),
    price_cents: c.price_cents, payment: c.payment ?? null, release_at: c.payment === 'held' ? c.release_at ?? null : null,
    revisions_left: svc?.mode === 'queue' ? Math.max(0, svc.revisions - c.revisions_used) : 0, revision_note: c.revision_note ?? null,
    created_at: c.created_at, expires_at: c.expires_at,
    reviewed: !!q('SELECT 1 FROM reviews WHERE call_id = ?').get(c.id),
  };
}

function refreshStats(id) {
  const r = q('SELECT avg(rating) a, count(*) n FROM reviews WHERE service_id = ?').get(id);
  const c = q(`SELECT count(*) n, sum(status = 'done') ok FROM calls WHERE service_id = ? AND status IN ('done','failed','timeout')`).get(id);
  const lat = q(`SELECT latency_ms l FROM calls WHERE service_id = ? AND status = 'done' ORDER BY completed_at DESC LIMIT 200`).all(id).map((x) => x.l).sort((a, b) => a - b);
  const u = q('SELECT avg(ok) u FROM probes WHERE service_id = ? AND at > ?').get(id, now() - WEEK);
  const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : null);
  q('UPDATE services SET rating=?, reviews_n=?, calls_n=?, success_rate=?, p50_ms=?, p95_ms=?, uptime_7d=? WHERE id=?')
    .run(r.a, r.n, c.n, c.n ? c.ok / c.n : null, pct(0.5), pct(0.95), u.u, id);
}

// ---------- accounts ----------
function authenticate(key) {
  if (!key) return null;
  return q('SELECT * FROM accounts WHERE key_hash = ?').get(sha(key)) || null;
}
function createAccount(body, ip) {
  limit(`acct:${ip}`, 10, 3600_000);
  const handle = String(body?.handle || '').toLowerCase();
  need(/^[a-z0-9][a-z0-9_-]{2,31}$/.test(handle), 422, 'invalid_handle', 'handle must be 3-32 characters: a-z, 0-9, - or _');
  need(!q('SELECT 1 FROM accounts WHERE handle = ?').get(handle), 409, 'handle_taken', 'That handle is taken');
  const api_key = `mk_${rand(24)}`;
  q('INSERT INTO accounts (handle, key_hash, created_at) VALUES (?,?,?)').run(handle, sha(api_key), now());
  return { handle, api_key, note: 'Store this key; it is shown once. Send it as "Authorization: Bearer <api_key>".' };
}
const requireAccount = (a) => { need(a, 401, 'unauthorized', 'Missing or invalid API key. Create one with POST /v1/accounts {"handle": "..."}'); return a; };

// ---------- services ----------
const svcBySlug = q('SELECT * FROM services WHERE slug = ?');
function getSvc(slug) { const s = svcBySlug.get(String(slug)); need(s, 404, 'not_found', `No service "${slug}"`); return s; }
const isWorker = (serviceId, accountId) => !!q('SELECT 1 FROM workers WHERE service_id = ? AND account_id = ?').get(serviceId, accountId);
function workSvc(account, slug) {
  const s = getSvc(slug);
  need(s.owner_id === requireAccount(account).id || isWorker(s.id, account.id), 403, 'forbidden', 'Only the service owner or its workers can do that');
  return s;
}
function ownSvc(account, slug) { const s = getSvc(slug); need(s.owner_id === requireAccount(account).id, 403, 'forbidden', 'Only the service owner can do that'); return s; }

function listServices({ q: query, available, mode, limit: lim, media, max_price_cents: maxPrice } = {}) {
  const t = now();
  const terms = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  let rows = q(`SELECT * FROM services WHERE status != 'suspended'`).all();
  if (media) rows = rows.filter((s) => mediaKinds(JSON.parse(s.output_schema)).size);
  if (maxPrice != null && maxPrice !== '') rows = rows.filter((s) => s.price_cents <= Number(maxPrice));
  if (mode === 'webhook' || mode === 'queue') rows = rows.filter((s) => s.mode === mode);
  const scored = [];
  for (const s of rows) {
    const live = isAvailable(s, t);
    if (available && !live) continue;
    let rel = 1;
    if (terms.length) {
      const name = s.name.toLowerCase(), tags = s.tags.toLowerCase(), desc = (s.description + ' ' + s.input_schema + ' ' + s.output_schema).toLowerCase();
      rel = terms.reduce((n, w) => n + (name.includes(w) ? 3 : 0) + (tags.includes(w) ? 2 : 0) + (desc.includes(w) ? 1 : 0), 0);
      if (!rel) continue;
    }
    // Bayesian-smoothed quality so a single 5-star review doesn't outrank a long track record.
    const rating = ((s.rating || 0) * s.reviews_n + 3.5 * 5) / (s.reviews_n + 5) / 5;
    const success = ((s.success_rate ?? 0) * s.calls_n + 0.8 * 5) / (s.calls_n + 5);
    const quality = rating * success * (0.5 + 0.5 * (s.uptime_7d ?? 0.5));
    scored.push({ s, live, score: rel * quality });
  }
  scored.sort((a, b) => b.live - a.live || b.score - a.score || (a.s.p50_ms ?? 1e12) - (b.s.p50_ms ?? 1e12));
  return { services: scored.slice(0, clamp(lim, 1, 100, 50)).map((x) => present(x.s)) };
}

function parseSchema(v, name) {
  need(v && typeof v === 'object' && !Array.isArray(v), 422, 'invalid_schema', `${name} must be a JSON Schema object`);
  need(JSON.stringify(v).length <= 20_000, 422, 'invalid_schema', `${name} is too large`);
  const errs = checkSchema(v);
  need(!errs.length, 422, 'invalid_schema', `${name} is not a supported JSON Schema`, errs);
  return v;
}
function parseSamples(v) {
  need(Array.isArray(v) && v.length <= 8, 422, 'invalid_field', 'samples must be an array of at most 8 {url, caption?} items');
  return v.map((x, i) => {
    let u; try { u = new URL(String(x?.url)); } catch { u = null; }
    need(u && (u.protocol === 'https:' || u.protocol === 'http:') && String(x.url).length <= 500, 422, 'invalid_field', `samples[${i}].url must be an http(s) URL`);
    const caption = typeof x.caption === 'string' ? x.caption.trim().slice(0, 200) : '';
    return caption ? { url: String(x.url), caption } : { url: String(x.url) };
  });
}
function endpointFields(body, mode) {
  if (mode !== 'webhook') return { endpoint_url: null, health_url: null };
  const bad = checkUrl(String(body.endpoint_url || ''));
  need(!bad, 422, 'invalid_endpoint', `endpoint_url ${bad}`);
  if (body.health_url) { const b = checkUrl(String(body.health_url)); need(!b, 422, 'invalid_endpoint', `health_url ${b}`); }
  return { endpoint_url: String(body.endpoint_url), health_url: body.health_url ? String(body.health_url) : null };
}

function createService(account, body) {
  requireAccount(account);
  need(body && typeof body === 'object', 422, 'invalid_body', 'JSON body required');
  limit(`pub:${account.id}`, 20, 3600_000);
  const name = str(body.name, 'name', 3, 80);
  const description = str(body.description, 'description', 10, 2000);
  const mode = body.mode;
  need(mode === 'webhook' || mode === 'queue', 422, 'invalid_field', 'mode must be "webhook" (automated endpoint) or "queue" (workers pull tasks)');
  const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string').map((t) => t.toLowerCase().trim().slice(0, 30)).filter(Boolean).slice(0, 8) : [];
  const input_schema = parseSchema(body.input_schema, 'input_schema');
  const output_schema = parseSchema(body.output_schema, 'output_schema');
  if (body.example_input != null) {
    const errs = validate(input_schema, body.example_input);
    need(!errs.length, 422, 'invalid_example', 'example_input does not match input_schema', errs);
  }
  const { endpoint_url, health_url } = endpointFields(body, mode);
  const samples = body.samples != null ? parseSamples(body.samples) : [];
  const timeout_ms = mode === 'webhook' ? clamp(body.timeout_ms, 1000, 120_000, 30_000) : clamp(body.timeout_ms, 10_000, 30 * 864e5, 600_000);
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'service';
  let slug = base;
  while (svcBySlug.get(slug)) slug = `${base}-${rand(2)}`;
  const webhook_secret = mode === 'webhook' ? `whsec_${rand(24)}` : null;
  q(`INSERT INTO services (slug, owner_id, name, description, tags, mode, endpoint_url, health_url, webhook_secret,
      input_schema, output_schema, example_input, timeout_ms, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(slug, account.id, name, description, JSON.stringify(tags), mode, endpoint_url, health_url, webhook_secret,
      JSON.stringify(input_schema), JSON.stringify(output_schema), body.example_input != null ? JSON.stringify(body.example_input) : null, timeout_ms, now());
  q('UPDATE services SET price_cents = ?, samples = ?, revisions = ? WHERE slug = ?').run(clamp(body.price_cents, 0, 100_000, 0), JSON.stringify(samples), clamp(body.revisions, 0, 3, 1), slug);
  const s = svcBySlug.get(slug);
  if (mode === 'webhook') probe(s).catch(() => {});
  return { service: present(svcBySlug.get(slug)), ...(webhook_secret ? { webhook_secret } : {}) };
}

function updateService(account, slug, body) {
  const s = ownSvc(account, slug);
  need(s.status !== 'suspended', 403, 'suspended', 'This listing was suspended by a moderator');
  const status = body?.status ?? s.status;
  need(status === 'active' || status === 'paused', 422, 'invalid_field', 'status must be "active" or "paused"');
  const description = body?.description != null ? str(body.description, 'description', 10, 2000) : s.description;
  let { endpoint_url, health_url } = s;
  if (s.mode === 'webhook' && (body?.endpoint_url != null || body?.health_url !== undefined)) {
    ({ endpoint_url, health_url } = endpointFields({ endpoint_url: body.endpoint_url ?? s.endpoint_url, health_url: body.health_url === undefined ? s.health_url : body.health_url }, 'webhook'));
  }
  q('UPDATE services SET status=?, description=?, endpoint_url=?, health_url=? WHERE id=?').run(status, description, endpoint_url, health_url, s.id);
  if (body?.price_cents != null) q('UPDATE services SET price_cents = ? WHERE id = ?').run(clamp(body.price_cents, 0, 100_000, 0), s.id);
  if (body?.samples != null) q('UPDATE services SET samples = ? WHERE id = ?').run(JSON.stringify(parseSamples(body.samples)), s.id);
  if (body?.revisions != null) q('UPDATE services SET revisions = ? WHERE id = ?').run(clamp(body.revisions, 0, 3, 1), s.id);
  const fresh = svcBySlug.get(s.slug);
  if (fresh.mode === 'webhook' && status === 'active') probe(fresh).catch(() => {});
  return { service: present(svcBySlug.get(s.slug)) };
}

function serviceDetail(slug) {
  const s = getSvc(slug);
  const reviews = q(`SELECT r.rating, r.comment, a.handle, r.created_at FROM reviews r JOIN accounts a ON a.id = r.caller_id
    WHERE r.service_id = ? ORDER BY r.created_at DESC LIMIT 50`).all(s.id);
  return { service: present(s), reviews };
}

// ---------- calls ----------
const callWaiters = new Map(); // call id -> Set<fn>  (callers waiting on a result)
const taskWaiters = new Map(); // service id -> Set<fn> (workers waiting on a task)
function wake(map, key, all = true) {
  const set = map.get(key);
  if (!set) return;
  for (const fn of [...set]) { set.delete(fn); fn(); if (!all) break; }
  if (!set.size) map.delete(key);
}
function waitOn(map, key, ms, signal) {
  return new Promise((resolve) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    const done = () => { clearTimeout(timer); set.delete(done); signal?.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done);
    set.add(done);
  });
}

// ---------- money ----------
function move(accountId, amount, kind, callId = null, note = null) {
  q('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?').run(amount, accountId);
  q('INSERT INTO ledger (account_id, at, kind, amount_cents, call_id, note) VALUES (?,?,?,?,?,?)').run(accountId, now(), kind, amount, callId, note);
}
// Pay the provider on success, refund the caller otherwise. Runs once per call.
function settle(id, status) {
  const c = q('SELECT c.price_cents, c.settled, c.caller_id, s.owner_id, s.slug FROM calls c JOIN services s ON s.id = c.service_id WHERE c.id = ?').get(id);
  if (!c || c.settled || !c.price_cents) return;
  q('UPDATE calls SET settled = 1, payment = ?, release_at = NULL WHERE id = ?').run(status === 'done' ? 'released' : 'refunded', id);
  if (status === 'done') {
    const fee = Math.round(c.price_cents * FEE_PCT / 100);
    move(c.owner_id, c.price_cents, 'earning', id, c.slug);
    if (fee) move(c.owner_id, -fee, 'fee', id, `${FEE_PCT}% platform fee`);
    q('UPDATE accounts SET earned_cents = earned_cents + ? WHERE id = ?').run(c.price_cents - fee, c.owner_id);
  } else move(c.caller_id, c.price_cents, 'refund', id, `call ${status}`);
}
// Human work is paid when the buyer accepts it (or the review window lapses); automated calls pay at once.
function holdOrSettle(id, status) {
  const c = q('SELECT c.price_cents, c.settled, s.mode FROM calls c JOIN services s ON s.id = c.service_id WHERE c.id = ?').get(id);
  if (!c || c.settled || !c.price_cents) return;
  if (status === 'done' && c.mode === 'queue') q(`UPDATE calls SET payment = 'held', release_at = ? WHERE id = ?`).run(now() + REVIEW_MS, id);
  else settle(id, status);
}
async function notifyCallback(id) {
  const c = q('SELECT c.*, s.slug FROM calls c JOIN services s ON s.id = c.service_id WHERE c.id = ?').get(id);
  if (!c?.callback_url) return;
  const body = JSON.stringify(presentCall(c, c.slug));
  for (const delay of [0, 10_000, 60_000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay).unref());
    try {
      const r = await safeRequest(c.callback_url, { method: 'POST', body, timeout: 10_000, headers: { 'content-type': 'application/json', 'user-agent': 'service-market/1', 'x-market-call-id': id } });
      if (r.status < 500) return;
    } catch { /* retry */ }
  }
}

function finishCall(id, serviceId, status, { output, error } = {}) {
  const c = q('SELECT created_at FROM calls WHERE id = ?').get(id);
  const t = now();
  q('UPDATE calls SET status=?, output=?, error=?, completed_at=?, latency_ms=? WHERE id=?')
    .run(status, output !== undefined ? JSON.stringify(output) : null, error || null, t, t - c.created_at, id);
  q('UPDATE calls SET revision_note = NULL WHERE id = ?').run(id);
  holdOrSettle(id, status);
  refreshStats(serviceId);
  wake(callWaiters, id);
  notifyCallback(id).catch(() => {});
}

async function callService(account, slug, body, signal) {
  requireAccount(account);
  limit(`call:${account.id}`, 120, 60_000);
  const s = getSvc(slug);
  need(s.status === 'active', 503, 'service_unavailable', s.status === 'suspended' ? 'This service is suspended' : 'This service is paused by its owner');
  need(body && typeof body === 'object' && 'input' in body, 422, 'invalid_body', 'Body must be {"input": ...}');
  need(JSON.stringify(body.input).length <= 100_000, 413, 'too_large', 'input exceeds 100 kB');
  const errs = validate(JSON.parse(s.input_schema), body.input);
  need(!errs.length, 422, 'invalid_input', 'input does not match the service input_schema', errs);
  if (s.mode === 'queue' && !isAvailable(s)) {
    need(body.queue_if_offline === true, 503, 'service_unavailable',
      'No worker is online for this service right now. Pick an available service, or pass "queue_if_offline": true to queue the task anyway.');
  }
  let callback_url = null;
  if (body.callback_url != null) {
    const bad = checkUrl(String(body.callback_url));
    need(!bad, 422, 'invalid_callback', `callback_url ${bad}`);
    callback_url = String(body.callback_url);
  }
  // The owner (and their workers) can exercise their own listing for free.
  const price = s.owner_id === account.id ? 0 : s.price_cents;
  if (price) {
    need(Number(body.max_price_cents) >= price, 402, 'price_not_accepted',
      `This service costs ${price} cents per call. Pass "max_price_cents": ${price} (or more) to accept the charge.`);
    const bal = q('SELECT balance_cents b FROM accounts WHERE id = ?').get(account.id).b;
    need(bal >= price, 402, 'insufficient_funds', `Balance is ${bal} cents; this call costs ${price}. Add funds at ${PUBLIC_URL}/#/billing`);
  }
  const id = `c_${rand(10)}`;
  const t = now();
  q('INSERT INTO calls (id, service_id, caller_id, input, status, created_at, expires_at, price_cents, callback_url) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, s.id, account.id, JSON.stringify(body.input), s.mode === 'queue' ? 'pending' : 'running', t, t + s.timeout_ms, price, callback_url);
  if (price) move(account.id, -price, 'hold', id, s.slug);

  if (s.mode === 'queue') {
    wake(taskWaiters, s.id, false);
    return getCall(account, id, body.wait_ms ?? 25_000, signal);
  }

  // webhook: synchronous proxy
  const payload = JSON.stringify({ call_id: id, service: s.slug, input: body.input });
  const signature = crypto.createHmac('sha256', s.webhook_secret).update(payload).digest('hex');
  try {
    let r;
    try {
      r = await safeRequest(s.endpoint_url, {
        method: 'POST', body: payload, timeout: s.timeout_ms,
        headers: { 'content-type': 'application/json', 'user-agent': 'service-market/1', 'x-market-signature': `sha256=${signature}`, 'x-market-call-id': id },
      });
    } catch (e) {
      q('UPDATE services SET probe_ok = 0, last_probe_at = ? WHERE id = ?').run(now(), s.id);
      throw new Error(`provider unreachable: ${e.code || e.message}`);
    }
    if (r.status < 200 || r.status >= 300) throw new Error(`provider returned HTTP ${r.status}`);
    let output;
    try { output = JSON.parse(r.body); } catch { throw new Error('provider returned a non-JSON body'); }
    const oerrs = validate(JSON.parse(s.output_schema), output);
    if (oerrs.length) throw new Error(`provider output violates output_schema: ${oerrs.join('; ')}`);
    q('UPDATE services SET probe_ok = 1, last_probe_at = ? WHERE id = ?').run(now(), s.id);
    finishCall(id, s.id, 'done', { output });
  } catch (e) {
    finishCall(id, s.id, 'failed', { error: e.message });
  }
  return getCall(account, id, 0);
}

async function getCall(account, id, waitMs, signal) {
  requireAccount(account);
  const load = () => q('SELECT c.*, s.slug, s.owner_id FROM calls c JOIN services s ON s.id = c.service_id WHERE c.id = ?').get(String(id));
  let c = load();
  need(c && (c.caller_id === account.id || c.owner_id === account.id || isWorker(c.service_id, account.id)), 404, 'not_found', 'No such call');
  const wait = clamp(waitMs, 0, 50_000, 0);
  if (wait && (c.status === 'pending' || c.status === 'claimed')) {
    await waitOn(callWaiters, c.id, wait, signal);
    c = load();
  }
  return presentCall(c, c.slug);
}

// Worker long-poll. Polling doubles as the presence heartbeat.
async function nextTask(account, slug, waitMs, signal) {
  const s = workSvc(account, slug);
  need(s.mode === 'queue', 409, 'wrong_mode', 'Only queue-mode services have a task inbox');
  const seen = q('UPDATE services SET last_seen_at = ? WHERE id = ?');
  const deadline = now() + clamp(waitMs, 0, 50_000, 25_000);
  for (;;) {
    seen.run(now(), s.id);
    if (!presence.has(s.id)) presence.set(s.id, new Map());
    presence.get(s.id).set(account.id, now());
    const c = q(`SELECT * FROM calls WHERE service_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at LIMIT 1`).get(s.id, now());
    if (c) {
      q(`UPDATE calls SET status = 'claimed', claimed_at = ?, claimed_by = ? WHERE id = ?`).run(now(), account.id, c.id);
      return {
        call_id: c.id, input: JSON.parse(c.input), output_schema: JSON.parse(s.output_schema), created_at: c.created_at, expires_at: c.expires_at,
        ...(c.revision_note ? { revision: { note: c.revision_note, previous_output: c.output != null ? JSON.parse(c.output) : null } } : {}),
      };
    }
    const left = deadline - now();
    if (left <= 0 || signal?.aborted) return null;
    await waitOn(taskWaiters, s.id, Math.min(left, 10_000), signal);
  }
}

function submitResult(account, id, body) {
  requireAccount(account);
  const c = q('SELECT c.*, s.owner_id, s.output_schema, s.slug FROM calls c JOIN services s ON s.id = c.service_id WHERE c.id = ?').get(String(id));
  need(c && (c.owner_id === account.id || isWorker(c.service_id, account.id)), 404, 'not_found', 'No such call for a service you work on');
  need(c.status === 'claimed' || c.status === 'pending', 409, 'already_finished', `Call is already ${c.status}`);
  need(body && typeof body === 'object', 422, 'invalid_body', 'Body must be {"output": ...} or {"error": "reason"}');
  if (typeof body.error === 'string' && body.error) {
    finishCall(c.id, c.service_id, 'failed', { error: `provider declined: ${body.error.slice(0, 500)}` });
  } else {
    need('output' in body, 422, 'invalid_body', 'Body must be {"output": ...} or {"error": "reason"}');
    const errs = validate(JSON.parse(c.output_schema), body.output);
    need(!errs.length, 422, 'invalid_output', 'output does not match the service output_schema', errs);
    need(JSON.stringify(body.output).length <= 500_000, 413, 'too_large', 'output exceeds 500 kB');
    finishCall(c.id, c.service_id, 'done', { output: body.output });
  }
  return { call_id: c.id, status: q('SELECT status FROM calls WHERE id = ?').get(c.id).status };
}

// ---------- buyer decisions on delivered work ----------
function buyerCall(account, id) {
  requireAccount(account);
  const c = q('SELECT c.*, s.mode, s.revisions, s.timeout_ms, s.slug FROM calls c JOIN services s ON s.id = c.service_id WHERE c.id = ?').get(String(id));
  need(c && c.caller_id === account.id, 404, 'not_found', 'No such call made by you');
  return c;
}
function acceptCall(account, id) {
  const c = buyerCall(account, id);
  need(c.status === 'done' && c.payment === 'held', 409, 'not_held', 'There is no held payment to release on this call');
  settle(c.id, 'done');
  return getCall(account, c.id, 0);
}
function requestRevision(account, id, body) {
  const c = buyerCall(account, id);
  const open = c.payment === 'held' || (!c.price_cents && now() - c.completed_at < REVIEW_MS);
  need(c.mode === 'queue' && c.status === 'done' && open, 409, 'not_revisable', 'Changes can only be requested on a delivered commission that has not been accepted yet');
  need(c.revisions_used < c.revisions, 409, 'no_revisions_left', 'No rounds of changes are left on this commission');
  const note = str(body?.note, 'note', 3, 2000);
  q(`UPDATE calls SET status = 'pending', claimed_at = NULL, revision_note = ?, revisions_used = revisions_used + 1, release_at = NULL, expires_at = ? WHERE id = ?`).run(note, now() + c.timeout_ms, c.id);
  wake(taskWaiters, c.service_id, false);
  return getCall(account, c.id, 0);
}
function disputeCall(account, id, body) {
  const c = buyerCall(account, id);
  need(c.status === 'done' && c.payment === 'held', 409, 'not_held', 'Only a delivery whose payment is still held can be disputed');
  const reason = str(body?.reason, 'reason', 10, 2000);
  q(`UPDATE calls SET payment = 'disputed', release_at = NULL, dispute_reason = ?, disputed_at = ? WHERE id = ?`).run(reason, now(), c.id);
  return getCall(account, c.id, 0);
}

function reviewCall(account, id, body) {
  requireAccount(account);
  const c = q('SELECT c.*, s.owner_id FROM calls c JOIN services s ON s.id = c.service_id WHERE c.id = ?').get(String(id));
  need(c && c.caller_id === account.id, 404, 'not_found', 'No such call made by you');
  need(c.owner_id !== account.id, 403, 'forbidden', 'You cannot review your own service');
  need(['done', 'failed', 'timeout'].includes(c.status), 409, 'not_finished', 'Review a call after it finishes');
  const rating = Number(body?.rating);
  need(Number.isInteger(rating) && rating >= 1 && rating <= 5, 422, 'invalid_field', 'rating must be an integer 1-5');
  need(!q('SELECT 1 FROM reviews WHERE call_id = ?').get(c.id), 409, 'already_reviewed', 'This call was already reviewed');
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : null;
  q('INSERT INTO reviews (call_id, service_id, caller_id, rating, comment, created_at) VALUES (?,?,?,?,?,?)').run(c.id, c.service_id, account.id, rating, comment || null, now());
  refreshStats(c.service_id);
  return { call_id: c.id, rating };
}

// ---------- background: probes, presence samples, expiry ----------
async function probe(s) {
  let ok = 0;
  try {
    const r = s.health_url
      ? await safeRequest(s.health_url, { method: 'GET', timeout: 10_000, headers: { 'user-agent': 'service-market/1' } })
      : await safeRequest(s.endpoint_url, { method: 'OPTIONS', timeout: 10_000, headers: { 'user-agent': 'service-market/1' } });
    // With a health URL we want 2xx; without one, any non-5xx answer proves the endpoint is up.
    ok = s.health_url ? Number(r.status >= 200 && r.status < 300) : Number(r.status < 500);
  } catch { ok = 0; }
  const t = now();
  q('UPDATE services SET probe_ok = ?, last_probe_at = ? WHERE id = ?').run(ok, t, s.id);
  q('INSERT INTO probes (service_id, at, ok) VALUES (?,?,?)').run(s.id, t, ok);
  refreshStats(s.id);
}
async function probeAll() {
  const t = now();
  const all = q(`SELECT * FROM services WHERE status = 'active'`).all();
  for (const s of all.filter((x) => x.mode === 'queue')) {
    q('INSERT INTO probes (service_id, at, ok) VALUES (?,?,?)').run(s.id, t, Number(isAvailable(s, t)));
    refreshStats(s.id);
  }
  const hooks = all.filter((x) => x.mode === 'webhook');
  for (let i = 0; i < hooks.length; i += 10) await Promise.all(hooks.slice(i, i + 10).map((s) => probe(s).catch(() => {})));
  q('DELETE FROM probes WHERE at < ?').run(t - WEEK);
}
function sweep() {
  const t = now();
  for (const c of q(`SELECT id, service_id, revisions_used, output, payment FROM calls WHERE status IN ('pending','claimed') AND expires_at <= ?`).all(t)) {
    if (c.revisions_used && c.output != null) {
      // A requested revision never arrived: the earlier delivery stands and the buyer decides again.
      q(`UPDATE calls SET status = 'done', revision_note = NULL, release_at = ? WHERE id = ?`).run(c.payment === 'held' ? t + REVIEW_MS : null, c.id);
      wake(callWaiters, c.id);
    } else finishCall(c.id, c.service_id, 'timeout', { error: 'no result before the service timeout' });
  }
  for (const c of q(`SELECT id FROM calls WHERE payment = 'held' AND status = 'done' AND release_at <= ?`).all(t)) { settle(c.id, 'done'); wake(callWaiters, c.id); }
  // A worker that claimed a task and vanished gives it back after 5 minutes.
  q(`UPDATE calls SET status = 'pending', claimed_at = NULL WHERE status = 'claimed' AND claimed_at < ?`).run(t - 300_000);
  // A worker answering a claimed task is not polling, but is still present.
  q(`UPDATE services SET last_seen_at = ? WHERE mode = 'queue' AND id IN (SELECT service_id FROM calls WHERE status = 'claimed' AND claimed_at > ?)`).run(t, t - 300_000);
  // Webhook calls orphaned by a restart.
  for (const c of q(`SELECT id, service_id FROM calls WHERE status = 'running' AND created_at < ?`).all(t - 180_000)) {
    finishCall(c.id, c.service_id, 'failed', { error: 'interrupted' });
  }
}
setInterval(() => probeAll().catch((e) => console.error('probe', e)), PROBE_MS).unref();
setInterval(() => { try { sweep(); } catch (e) { console.error('sweep', e); } }, 5_000).unref();

// ---------- workers ----------
const acctByHandle = (h) => { const a = q('SELECT * FROM accounts WHERE handle = ?').get(String(h || '').toLowerCase()); need(a, 404, 'not_found', `No account "${h}"`); return a; };
function listWorkers(account, slug) {
  const s = ownSvc(account, slug), t = now();
  return { workers: q('SELECT a.id, a.handle, w.added_at FROM workers w JOIN accounts a ON a.id = w.account_id WHERE w.service_id = ? ORDER BY w.added_at').all(s.id).map((w) => {
    const last = presence.get(s.id)?.get(w.id) ?? null;
    return { handle: w.handle, added_at: w.added_at, last_seen_at: last, online: !!last && t - last < PRESENCE_MS };
  }) };
}
function addWorker(account, slug, body) {
  const s = ownSvc(account, slug);
  need(s.mode === 'queue', 409, 'wrong_mode', 'Only queue-mode services have workers');
  const w = acctByHandle(body?.handle);
  need(w.id !== s.owner_id, 409, 'already_worker', 'The owner can already work this inbox');
  need(q('SELECT count(*) n FROM workers WHERE service_id = ?').get(s.id).n < 50, 409, 'too_many', 'At most 50 workers per listing');
  q('INSERT OR IGNORE INTO workers (service_id, account_id, added_at) VALUES (?,?,?)').run(s.id, w.id, now());
  return { handle: w.handle };
}
function removeWorker(account, slug, handle) {
  const s = ownSvc(account, slug);
  const w = acctByHandle(handle);
  q('DELETE FROM workers WHERE service_id = ? AND account_id = ?').run(s.id, w.id);
  presence.get(s.id)?.delete(w.id);
}

// ---------- reports / moderation ----------
const REASONS = ['spam', 'harmful', 'fraud', 'broken', 'other'];
function reportService(account, slug, body) {
  requireAccount(account);
  limit(`report:${account.id}`, 20, 3600_000);
  const s = getSvc(slug);
  need(s.owner_id !== account.id, 403, 'forbidden', 'You cannot report your own listing');
  need(REASONS.includes(body?.reason), 422, 'invalid_field', `reason must be one of: ${REASONS.join(', ')}`);
  need(!q('SELECT 1 FROM reports WHERE service_id = ? AND reporter_id = ?').get(s.id, account.id), 409, 'already_reported', 'You already reported this listing');
  q('INSERT INTO reports (service_id, reporter_id, reason, detail, created_at) VALUES (?,?,?,?,?)').run(s.id, account.id, body.reason, typeof body.detail === 'string' ? body.detail.trim().slice(0, 1000) || null : null, now());
  // Five independent open reports take a listing down until a moderator looks.
  if (q(`SELECT count(*) n FROM reports WHERE service_id = ? AND status = 'open'`).get(s.id).n >= 5) q(`UPDATE services SET status = 'suspended' WHERE id = ?`).run(s.id);
  return { reported: s.slug };
}
const requireAdmin = (a) => { need(requireAccount(a).handle === ADMIN, 403, 'forbidden', 'Moderators only'); return a; };
const admin = {
  reports: (a) => { requireAdmin(a); return { reports: q(`SELECT r.id, s.slug service, s.name service_name, s.status service_status, a.handle reporter, r.reason, r.detail, r.created_at, r.status
    FROM reports r JOIN services s ON s.id = r.service_id JOIN accounts a ON a.id = r.reporter_id ORDER BY r.status = 'open' DESC, r.created_at DESC LIMIT 200`).all() }; },
  resolve: (a, id, body) => {
    requireAdmin(a);
    const r = q('SELECT * FROM reports WHERE id = ?').get(Number(id));
    need(r, 404, 'not_found', 'No such report');
    need(body?.action === 'dismiss' || body?.action === 'suspend', 422, 'invalid_field', 'action must be "dismiss" or "suspend"');
    if (body.action === 'suspend') {
      q(`UPDATE services SET status = 'suspended' WHERE id = ?`).run(r.service_id);
      q(`UPDATE reports SET status = 'resolved' WHERE service_id = ?`).run(r.service_id);
    } else q(`UPDATE reports SET status = 'resolved' WHERE id = ?`).run(r.id);
    return { id: r.id, status: 'resolved' };
  },
  setStatus: (a, slug, body) => {
    requireAdmin(a);
    const s = getSvc(slug);
    need(body?.status === 'active' || body?.status === 'suspended', 422, 'invalid_field', 'status must be "active" or "suspended"');
    q('UPDATE services SET status = ? WHERE id = ?').run(body.status, s.id);
    return { service: present(svcBySlug.get(s.slug)) };
  },
  credit: (a, body) => {
    requireAdmin(a);
    const to = acctByHandle(body?.handle), amt = Number(body?.amount_cents);
    need(Number.isInteger(amt) && amt !== 0 && Math.abs(amt) <= 1_000_000, 422, 'invalid_field', 'amount_cents must be a non-zero integer');
    move(to.id, amt, 'grant', null, typeof body.note === 'string' ? body.note.slice(0, 200) : null);
    return { handle: to.handle, balance_cents: q('SELECT balance_cents b FROM accounts WHERE id = ?').get(to.id).b };
  },
  disputes: (a) => { requireAdmin(a); return { disputes: q(`SELECT c.id call_id, s.slug service, a.handle buyer, c.price_cents, c.dispute_reason reason, c.disputed_at created_at, c.input, c.output
    FROM calls c JOIN services s ON s.id = c.service_id JOIN accounts a ON a.id = c.caller_id WHERE c.payment = 'disputed' ORDER BY c.disputed_at`).all()
    .map((d) => ({ ...d, input: JSON.parse(d.input), output: d.output != null ? JSON.parse(d.output) : null })) }; },
  resolveDispute: (a, id, body) => {
    requireAdmin(a);
    const c = q('SELECT id, payment FROM calls WHERE id = ?').get(String(id));
    need(c && c.payment === 'disputed', 404, 'not_found', 'No open dispute on that call');
    need(body?.action === 'release' || body?.action === 'refund', 422, 'invalid_field', 'action must be "release" or "refund"');
    settle(c.id, body.action === 'release' ? 'done' : 'refund');
    return { call_id: c.id, payment: body.action === 'release' ? 'released' : 'refunded' };
  },
  payouts: (a) => { requireAdmin(a); return { payouts: q('SELECT p.id, a.handle, p.amount_cents, p.destination, p.status, p.created_at FROM payouts p JOIN accounts a ON a.id = p.account_id ORDER BY p.status = \'requested\' DESC, p.created_at DESC LIMIT 200').all() }; },
  setPayout: (a, id, body) => {
    requireAdmin(a);
    const p = q('SELECT * FROM payouts WHERE id = ?').get(Number(id));
    need(p, 404, 'not_found', 'No such payout');
    need(p.status === 'requested', 409, 'already_finished', `Payout is already ${p.status}`);
    need(body?.status === 'paid' || body?.status === 'rejected', 422, 'invalid_field', 'status must be "paid" or "rejected"');
    q('UPDATE payouts SET status = ? WHERE id = ?').run(body.status, p.id);
    if (body.status === 'rejected') move(p.account_id, p.amount_cents, 'refund', null, `payout #${p.id} rejected`);
    return { id: p.id, status: body.status };
  },
};

// ---------- billing ----------
function billing(account) {
  const a = requireAccount(account);
  return {
    balance_cents: q('SELECT balance_cents b FROM accounts WHERE id = ?').get(a.id).b, payments_enabled: PAYMENTS, fee_percent: FEE_PCT,
    ledger: q('SELECT at, kind, amount_cents, call_id, note FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT 200').all(a.id),
  };
}
async function checkout(account, body, base) {
  const a = requireAccount(account);
  need(PAYMENTS, 501, 'payments_disabled', 'Card payments are not enabled on this deployment yet');
  const amt = Number(body?.amount_cents);
  need(Number.isInteger(amt) && amt >= 500 && amt <= 50_000, 422, 'invalid_field', 'amount_cents must be an integer from 500 to 50000');
  const form = new URLSearchParams({
    mode: 'payment', success_url: `${base}/#/billing?paid=1`, cancel_url: `${base}/#/billing`, client_reference_id: String(a.id),
    'metadata[account_id]': String(a.id), 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amt), 'line_items[0][price_data][product_data][name]': `${BRAND} balance`,
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${STRIPE_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  need(r.ok && j.url, 502, 'payment_provider', j.error?.message || 'Could not start checkout');
  return { url: j.url };
}
function stripeWebhook(raw, sigHeader) {
  need(STRIPE_WH, 501, 'payments_disabled', 'Payments are not enabled');
  const parts = Object.fromEntries(String(sigHeader || '').split(',').map((kv) => kv.split('=')));
  const expected = crypto.createHmac('sha256', STRIPE_WH).update(`${parts.t}.${raw || ''}`).digest('hex');
  const given = Buffer.from(String(parts.v1 || ''), 'utf8'), want = Buffer.from(expected, 'utf8');
  need(given.length === want.length && crypto.timingSafeEqual(given, want) && Math.abs(now() / 1000 - Number(parts.t)) < 300, 400, 'bad_signature', 'Invalid signature');
  const ev = JSON.parse(raw.toString('utf8'));
  if (ev.type !== 'checkout.session.completed' || ev.data?.object?.payment_status !== 'paid') return { received: true };
  if (q('SELECT 1 FROM stripe_events WHERE id = ?').get(ev.id)) return { received: true };
  const o = ev.data.object, acct = q('SELECT id FROM accounts WHERE id = ?').get(Number(o.metadata?.account_id));
  q('INSERT INTO stripe_events (id, at) VALUES (?,?)').run(ev.id, now());
  if (acct && Number.isInteger(o.amount_total) && o.amount_total > 0) move(acct.id, o.amount_total, 'topup', null, 'card payment');
  return { received: true };
}
function requestPayout(account, body) {
  const a = requireAccount(account);
  const amt = Number(body?.amount_cents);
  need(Number.isInteger(amt) && amt >= 1000, 422, 'invalid_field', 'amount_cents must be an integer of at least 1000');
  const dest = str(body?.destination, 'destination', 3, 200);
  const row = q('SELECT balance_cents b, earned_cents e FROM accounts WHERE id = ?').get(a.id);
  const out = q(`SELECT coalesce(sum(amount_cents), 0) n FROM payouts WHERE account_id = ? AND status != 'rejected'`).get(a.id).n;
  // Only money earned from completed calls can be withdrawn; added funds can only be spent.
  need(amt <= row.b && amt <= row.e - out, 422, 'insufficient_funds', `You can withdraw up to ${Math.max(0, Math.min(row.b, row.e - out))} cents of earnings`);
  move(a.id, -amt, 'payout', null, dest);
  const id = q('INSERT INTO payouts (account_id, amount_cents, destination, created_at) VALUES (?,?,?,?)').run(a.id, amt, dest, now()).lastInsertRowid;
  return { id: Number(id), status: 'requested' };
}

// ---------- uploads (deliverables such as images, audio, video) ----------
function storeUpload(account, type, buf) {
  requireAccount(account);
  limit(`up:${account.id}`, 60, 3600_000);
  const ext = UPLOAD_TYPES[String(type || '').split(';')[0].trim().toLowerCase()];
  need(ext, 415, 'unsupported_type', `Content-Type must be one of: ${Object.keys(UPLOAD_TYPES).join(', ')}`);
  need(buf && buf.length, 422, 'invalid_body', 'Send the raw file bytes as the request body');
  const used = fs.readdirSync(FILES_DIR).reduce((n, f) => n + fs.statSync(path.join(FILES_DIR, f)).size, 0);
  need(used + buf.length <= MAX_STORE, 507, 'storage_full', 'File storage is full; host the file elsewhere and return its URL');
  const name = `${rand(16)}.${ext}`;
  fs.writeFileSync(path.join(FILES_DIR, name), buf);
  return { url: `${PUBLIC_URL}/files/${name}`, content_type: EXT_TYPES[ext], bytes: buf.length };
}
function serveFile(res, name) {
  const file = path.join(FILES_DIR, name);
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(name) || !fs.existsSync(file)) return false;
  res.writeHead(200, {
    'content-type': EXT_TYPES[name.split('.').pop()] || 'application/octet-stream', 'content-length': fs.statSync(file).size,
    'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox", 'access-control-allow-origin': '*',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

// ---------- first-party services + seed ----------
function seed() {
  let house = q('SELECT * FROM accounts WHERE handle = ?').get('house');
  if (!house) {
    const key = process.env.HOUSE_KEY || `mk_${rand(24)}`;
    q('INSERT INTO accounts (handle, key_hash, created_at) VALUES (?,?,?)').run('house', sha(key), now());
    house = authenticate(key);
    if (!process.env.HOUSE_KEY) console.log(`house account key (shown once): ${key}`);
  }
  const have = new Set(q('SELECT name FROM services WHERE owner_id = ?').all(house.id).map((s) => s.name));
  for (const b of BUILTINS) {
    if (!have.has(b.listing.name)) createService(house, { ...b.listing, endpoint_url: `${PUBLIC_URL}/builtin/${b.path}`, health_url: `${PUBLIC_URL}/healthz` });
  }
  for (const l of HOUSE_QUEUES) if (!have.has(l.name)) createService(house, l);
}

// ---------- http ----------
const api = {
  meta: (c) => ({
    brand: c.site.BRAND, base_url: c.site.PUBLIC_URL, mcp_url: `${c.site.PUBLIC_URL}/mcp`, payments_enabled: PAYMENTS, fee_percent: FEE_PCT,
    storefront: c.site.storefront || c.query.get('storefront') === STOREFRONT.key ? { key: STOREFRONT.key, brand: STOREFRONT.brand, tagline: STOREFRONT.tagline, market_url: PUBLIC_URL, market_brand: BRAND } : null,
    counts: {
      services: q('SELECT count(*) n FROM services').get().n,
      available: q('SELECT * FROM services').all().filter((s) => isAvailable(s)).length,
      calls: q('SELECT count(*) n FROM calls').get().n,
    },
  }),
  billing, acceptCall, requestRevision, disputeCall, createAccount, listServices, serviceDetail, createService, updateService, callService, getCall, nextTask, submitResult, reviewCall, authenticate,
};
const ctx = { BRAND, PUBLIC_URL };
function siteFor(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  if (STOREFRONT.hosts.has(h)) return { BRAND: STOREFRONT.brand, PUBLIC_URL: `https://${h}`, storefront: true };
  return SITE_HOSTS.has(h) ? { BRAND, PUBLIC_URL: `https://${h}` } : ctx;
}

const routes = [
  ['GET', /^\/healthz$/, () => ({ ok: true })],
  ['GET', /^\/v1\/meta$/, (c) => api.meta(c)],
  ['POST', /^\/v1\/accounts$/, (c) => [201, createAccount(c.body, c.ip)]],
  ['GET', /^\/v1\/me$/, (c) => {
    const a = requireAccount(c.account);
    const row = q('SELECT balance_cents, earned_cents FROM accounts WHERE id = ?').get(a.id);
    return {
      handle: a.handle, ...row, is_admin: a.handle === ADMIN,
      services: q('SELECT * FROM services WHERE owner_id = ? ORDER BY created_at DESC').all(a.id).map(present),
      works_for: q('SELECT s.* FROM services s JOIN workers w ON w.service_id = s.id WHERE w.account_id = ? ORDER BY w.added_at DESC').all(a.id).map(present),
    };
  }],
  ['GET', /^\/v1\/services$/, (c) => listServices({ q: c.query.get('q'), available: ['1', 'true'].includes(c.query.get('available')), mode: c.query.get('mode'), limit: c.query.get('limit'), media: ['1', 'true'].includes(c.query.get('media')), max_price_cents: c.query.get('max_price_cents') })],
  ['POST', /^\/v1\/services$/, (c) => [201, createService(c.account, c.body)]],
  ['GET', /^\/v1\/services\/([^/]+)$/, (c, slug) => serviceDetail(slug)],
  ['PATCH', /^\/v1\/services\/([^/]+)$/, (c, slug) => updateService(c.account, slug, c.body)],
  ['DELETE', /^\/v1\/services\/([^/]+)$/, (c, slug) => { const s = ownSvc(c.account, slug); q('DELETE FROM services WHERE id = ?').run(s.id); return [204, null]; }],
  ['POST', /^\/v1\/services\/([^/]+)\/call$/, async (c, slug) => {
    const r = await callService(c.account, slug, c.body, c.signal);
    return [r.status === 'done' ? 200 : r.status === 'failed' ? 502 : r.status === 'timeout' ? 504 : 202, r];
  }],
  ['GET', /^\/v1\/services\/([^/]+)\/tasks\/next$/, async (c, slug) => { const t = await nextTask(c.account, slug, c.query.get('wait_ms') ?? 25_000, c.signal); return t ? t : [204, null]; }],
  ['GET', /^\/v1\/calls\/([^/]+)$/, (c, id) => getCall(c.account, id, c.query.get('wait_ms') ?? 0, c.signal)],
  ['POST', /^\/v1\/calls\/([^/]+)\/result$/, (c, id) => submitResult(c.account, id, c.body)],
  ['POST', /^\/v1\/calls\/([^/]+)\/accept$/, (c, id) => acceptCall(c.account, id)],
  ['POST', /^\/v1\/calls\/([^/]+)\/revision$/, (c, id) => requestRevision(c.account, id, c.body)],
  ['POST', /^\/v1\/calls\/([^/]+)\/dispute$/, (c, id) => disputeCall(c.account, id, c.body)],
  ['GET', /^\/v1\/admin\/disputes$/, (c) => admin.disputes(c.account)],
  ['POST', /^\/v1\/admin\/disputes\/([^/]+)$/, (c, id) => admin.resolveDispute(c.account, id, c.body)],
  ['POST', /^\/v1\/calls\/([^/]+)\/review$/, (c, id) => [201, reviewCall(c.account, id, c.body)]],
  ['GET', /^\/v1\/calls$/, (c) => ({ calls: q(`SELECT c.id call_id, s.slug service, c.status, c.price_cents, c.payment, c.created_at FROM calls c JOIN services s ON s.id = c.service_id
    WHERE c.caller_id = ? ORDER BY c.created_at DESC LIMIT 50`).all(requireAccount(c.account).id) })],
  ['GET', /^\/v1\/services\/([^/]+)\/workers$/, (c, slug) => listWorkers(c.account, slug)],
  ['POST', /^\/v1\/services\/([^/]+)\/workers$/, (c, slug) => [201, addWorker(c.account, slug, c.body)]],
  ['DELETE', /^\/v1\/services\/([^/]+)\/workers\/([^/]+)$/, (c, slug, handle) => { removeWorker(c.account, slug, handle); return [204, null]; }],
  ['POST', /^\/v1\/services\/([^/]+)\/report$/, (c, slug) => [201, reportService(c.account, slug, c.body)]],
  ['GET', /^\/v1\/billing$/, (c) => billing(c.account)],
  ['POST', /^\/v1\/billing\/checkout$/, (c) => checkout(c.account, c.body, c.site.PUBLIC_URL)],
  ['POST', /^\/v1\/billing\/payouts$/, (c) => [201, requestPayout(c.account, c.body)]],
  ['POST', /^\/v1\/billing\/stripe-webhook$/, (c) => stripeWebhook(c.raw, c.stripeSig)],
  ['GET', /^\/v1\/admin\/reports$/, (c) => admin.reports(c.account)],
  ['POST', /^\/v1\/admin\/reports\/(\d+)\/resolve$/, (c, id) => admin.resolve(c.account, id, c.body)],
  ['POST', /^\/v1\/admin\/services\/([^/]+)\/status$/, (c, slug) => admin.setStatus(c.account, slug, c.body)],
  ['POST', /^\/v1\/admin\/credit$/, (c) => admin.credit(c.account, c.body)],
  ['GET', /^\/v1\/admin\/payouts$/, (c) => admin.payouts(c.account)],
  ['POST', /^\/v1\/admin\/payouts\/(\d+)$/, (c, id) => admin.setPayout(c.account, id, c.body)],
  ['POST', /^\/v1\/uploads$/, (c) => [201, storeUpload(c.account, c.contentType, c.raw)]],
  ['POST', /^\/builtin\/([a-z-]+)$/, async (c, name) => {
    const b = BUILTINS.find((x) => x.path === name);
    need(b, 404, 'not_found', 'No such built-in service');
    try { return await b.run(c.body?.input); } catch (e) { if (e.upstream || e.name === 'TimeoutError') throw new Err(502, 'upstream', e.message); throw e; }
  }],
  ['POST', /^\/mcp$/, (c) => handleMcp(c.body, c.account, api, c.site, c.signal)],
  ['GET', /^\/openapi\.json$/, (c) => openapi(c.site)],
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.png': 'image/png' };
const SEC = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; img-src 'self' https: http: data:; media-src 'self' https: http:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};
function serveStatic(res, pathname, brand) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.join(DIR, 'public', path.normalize(rel));
  if (!file.startsWith(path.join(DIR, 'public') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  let data = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html') data = Buffer.from(data.toString('utf8').replaceAll('{{BRAND}}', brand.replace(/[<>&"]/g, '')));
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache', ...SEC });
  res.end(data);
  return true;
}

function readBody(req, raw = false) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > (raw ? MAX_UPLOAD : 600_000)) { reject(new Err(413, 'too_large', 'Request body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!size) return resolve(undefined);
      if (raw) return resolve(Buffer.concat(chunks));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Err(400, 'invalid_json', 'Request body is not valid JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, body, headers = {}) => {
    if (res.headersSent) return;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
    if (body === null || body === undefined) { res.writeHead(status, { ...cors, ...headers }); return res.end(); }
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors, ...headers });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === 'OPTIONS') return send(204, null);
    if (req.method === 'GET' && url.pathname === '/llms.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' });
      return res.end(llmsTxt(siteFor(req.headers.host)));
    }
    const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
    if (!route) {
      if (req.method === 'GET' && url.pathname.startsWith('/files/') && serveFile(res, url.pathname.slice(7))) return;
      if (req.method === 'GET' && serveStatic(res, url.pathname, siteFor(req.headers.host).BRAND)) return;
      if (url.pathname === '/mcp') return send(405, { error: { code: 'method_not_allowed', message: 'POST JSON-RPC to /mcp' } }, { allow: 'POST' });
      throw new Err(404, 'not_found', `No route ${req.method} ${url.pathname}. See /llms.txt or /openapi.json`);
    }
    const ip = req.headers['fly-client-ip'] || req.socket.remoteAddress || '?';
    limit(`ip:${ip}`, 600, 60_000);
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    const isUpload = url.pathname === '/v1/uploads', isHook = url.pathname === '/v1/billing/stripe-webhook';
    const c = { ip, query: url.searchParams, account: authenticate(bearer), signal: ac.signal, contentType: req.headers['content-type'], site: siteFor(req.headers.host), stripeSig: req.headers['stripe-signature'] };
    if (isUpload) { requireAccount(c.account); c.raw = await readBody(req, true); }
    else if (isHook) c.raw = await readBody(req, true);
    else if (['POST', 'PATCH'].includes(req.method)) c.body = await readBody(req);
    const out = await route[2](c, ...route[1].exec(url.pathname).slice(1).map(decodeURIComponent));
    if (Array.isArray(out)) send(out[0], out[1]); else send(200, out);
  } catch (e) {
    if (e instanceof Err) return send(e.status, { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } });
    console.error(e);
    send(500, { error: { code: 'internal', message: 'Internal error' } });
  }
});
server.requestTimeout = 0;
server.listen(PORT, () => {
  console.log(`${BRAND} listening on ${PORT} (${PUBLIC_URL})`);
  try { seed(); } catch (e) { console.error('seed', e); }
  setTimeout(() => probeAll().catch(() => {}), 1500).unref();
});
