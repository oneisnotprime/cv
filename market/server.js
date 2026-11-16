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

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const BRAND = process.env.BRAND || 'Market';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DB_PATH = process.env.DB_PATH || path.join(DIR, 'data.db');
const PROBE_MS = Number(process.env.PROBE_MS || 60_000);
const PRESENCE_MS = 30_000; // a queue service is "available" if a worker polled this recently
const WEEK = 7 * 864e5;

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
function present(s) {
  const input_schema = JSON.parse(s.input_schema), output_schema = JSON.parse(s.output_schema);
  return {
    slug: s.slug, name: s.name, description: s.description, tags: JSON.parse(s.tags), mode: s.mode,
    owner: ownerHandle.get(s.owner_id)?.handle, status: s.status, available: isAvailable(s),
    input_schema, output_schema, input_summary: summarize(input_schema), output_summary: summarize(output_schema),
    example_input: s.example_input ? JSON.parse(s.example_input) : null, timeout_ms: s.timeout_ms, created_at: s.created_at,
    call_url: `${PUBLIC_URL}/v1/services/${s.slug}/call`,
    stats: {
      rating: s.rating, reviews: s.reviews_n, calls: s.calls_n, success_rate: s.success_rate,
      p50_ms: s.p50_ms, p95_ms: s.p95_ms, uptime_7d: s.uptime_7d, pending: pendingCount.get(s.id).n,
      last_checked_at: s.mode === 'queue' ? s.last_seen_at : s.last_probe_at,
    },
  };
}
function presentCall(c, slug) {
  return {
    call_id: c.id, service: slug, status: c.status, input: JSON.parse(c.input),
    ...(c.output != null ? { output: JSON.parse(c.output) } : {}),
    ...(c.error ? { error: { code: 'call_failed', message: c.error } } : {}),
    ...(c.latency_ms != null ? { latency_ms: c.latency_ms } : {}),
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
function ownSvc(account, slug) { const s = getSvc(slug); need(s.owner_id === requireAccount(account).id, 403, 'forbidden', 'Only the service owner can do that'); return s; }

function listServices({ q: query, available, mode, limit: lim } = {}) {
  const t = now();
  const terms = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  let rows = q(`SELECT * FROM services WHERE status != 'deleted'`).all();
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
  const timeout_ms = mode === 'webhook' ? clamp(body.timeout_ms, 1000, 120_000, 30_000) : clamp(body.timeout_ms, 10_000, 864e5, 600_000);
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'service';
  let slug = base;
  while (svcBySlug.get(slug)) slug = `${base}-${rand(2)}`;
  const webhook_secret = mode === 'webhook' ? `whsec_${rand(24)}` : null;
  q(`INSERT INTO services (slug, owner_id, name, description, tags, mode, endpoint_url, health_url, webhook_secret,
      input_schema, output_schema, example_input, timeout_ms, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(slug, account.id, name, description, JSON.stringify(tags), mode, endpoint_url, health_url, webhook_secret,
      JSON.stringify(input_schema), JSON.stringify(output_schema), body.example_input != null ? JSON.stringify(body.example_input) : null, timeout_ms, now());
  const s = svcBySlug.get(slug);
  if (mode === 'webhook') probe(s).catch(() => {});
  return { service: present(svcBySlug.get(slug)), ...(webhook_secret ? { webhook_secret } : {}) };
}

function updateService(account, slug, body) {
  const s = ownSvc(account, slug);
  const status = body?.status ?? s.status;
  need(status === 'active' || status === 'paused', 422, 'invalid_field', 'status must be "active" or "paused"');
  const description = body?.description != null ? str(body.description, 'description', 10, 2000) : s.description;
  let { endpoint_url, health_url } = s;
  if (s.mode === 'webhook' && (body?.endpoint_url != null || body?.health_url !== undefined)) {
    ({ endpoint_url, health_url } = endpointFields({ endpoint_url: body.endpoint_url ?? s.endpoint_url, health_url: body.health_url === undefined ? s.health_url : body.health_url }, 'webhook'));
  }
  q('UPDATE services SET status=?, description=?, endpoint_url=?, health_url=? WHERE id=?').run(status, description, endpoint_url, health_url, s.id);
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

function finishCall(id, serviceId, status, { output, error } = {}) {
  const c = q('SELECT created_at FROM calls WHERE id = ?').get(id);
  const t = now();
  q('UPDATE calls SET status=?, output=?, error=?, completed_at=?, latency_ms=? WHERE id=?')
    .run(status, output !== undefined ? JSON.stringify(output) : null, error || null, t, t - c.created_at, id);
  refreshStats(serviceId);
  wake(callWaiters, id);
}

async function callService(account, slug, body, signal) {
  requireAccount(account);
  limit(`call:${account.id}`, 120, 60_000);
  const s = getSvc(slug);
  need(s.status === 'active', 503, 'service_unavailable', 'This service is paused by its owner');
  need(body && typeof body === 'object' && 'input' in body, 422, 'invalid_body', 'Body must be {"input": ...}');
  need(JSON.stringify(body.input).length <= 100_000, 413, 'too_large', 'input exceeds 100 kB');
  const errs = validate(JSON.parse(s.input_schema), body.input);
  need(!errs.length, 422, 'invalid_input', 'input does not match the service input_schema', errs);
  if (s.mode === 'queue' && !isAvailable(s)) {
    need(body.queue_if_offline === true, 503, 'service_unavailable',
      'No worker is online for this service right now. Pick an available service, or pass "queue_if_offline": true to queue the task anyway.');
  }
  const id = `c_${rand(10)}`;
  const t = now();
  q('INSERT INTO calls (id, service_id, caller_id, input, status, created_at, expires_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, s.id, account.id, JSON.stringify(body.input), s.mode === 'queue' ? 'pending' : 'running', t, t + s.timeout_ms);

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
  need(c && (c.caller_id === account.id || c.owner_id === account.id), 404, 'not_found', 'No such call');
  const wait = clamp(waitMs, 0, 50_000, 0);
  if (wait && (c.status === 'pending' || c.status === 'claimed')) {
    await waitOn(callWaiters, c.id, wait, signal);
    c = load();
  }
  return presentCall(c, c.slug);
}

// Worker long-poll. Polling doubles as the presence heartbeat.
async function nextTask(account, slug, waitMs, signal) {
  const s = ownSvc(account, slug);
  need(s.mode === 'queue', 409, 'wrong_mode', 'Only queue-mode services have a task inbox');
  const seen = q('UPDATE services SET last_seen_at = ? WHERE id = ?');
  const deadline = now() + clamp(waitMs, 0, 50_000, 25_000);
  for (;;) {
    seen.run(now(), s.id);
    const c = q(`SELECT * FROM calls WHERE service_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at LIMIT 1`).get(s.id, now());
    if (c) {
      q(`UPDATE calls SET status = 'claimed', claimed_at = ? WHERE id = ?`).run(now(), c.id);
      return { call_id: c.id, input: JSON.parse(c.input), output_schema: JSON.parse(s.output_schema), created_at: c.created_at, expires_at: c.expires_at };
    }
    const left = deadline - now();
    if (left <= 0 || signal?.aborted) return null;
    await waitOn(taskWaiters, s.id, Math.min(left, 10_000), signal);
  }
}

function submitResult(account, id, body) {
  requireAccount(account);
  const c = q('SELECT c.*, s.owner_id, s.output_schema, s.slug FROM calls c JOIN services s ON s.id = c.service_id WHERE c.id = ?').get(String(id));
  need(c && c.owner_id === account.id, 404, 'not_found', 'No such call for a service you own');
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
  for (const c of q(`SELECT id, service_id FROM calls WHERE status IN ('pending','claimed') AND expires_at <= ?`).all(t)) {
    finishCall(c.id, c.service_id, 'timeout', { error: 'no result before the service timeout' });
  }
  // A worker that claimed a task and vanished gives it back after 5 minutes.
  q(`UPDATE calls SET status = 'pending', claimed_at = NULL WHERE status = 'claimed' AND claimed_at < ?`).run(t - 300_000);
  // Webhook calls orphaned by a restart.
  for (const c of q(`SELECT id, service_id FROM calls WHERE status = 'running' AND created_at < ?`).all(t - 180_000)) {
    finishCall(c.id, c.service_id, 'failed', { error: 'interrupted' });
  }
}
setInterval(() => probeAll().catch((e) => console.error('probe', e)), PROBE_MS).unref();
setInterval(() => { try { sweep(); } catch (e) { console.error('sweep', e); } }, 5_000).unref();

// ---------- first-party service + seed ----------
async function wikipediaTitles(input) {
  const n = clamp(input?.limit, 1, 10, 5);
  const u = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${n}&srsearch=${encodeURIComponent(String(input?.query || ''))}`;
  const r = await fetch(u, { headers: { 'user-agent': 'service-market/1 (first-party wikipedia-titles service)' }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Err(502, 'upstream', `Wikipedia returned ${r.status}`);
  const j = await r.json();
  return { titles: (j.query?.search || []).map((x) => x.title) };
}
function seed() {
  if (q('SELECT 1 FROM accounts LIMIT 1').get()) return;
  const key = process.env.HOUSE_KEY || `mk_${rand(24)}`;
  q('INSERT INTO accounts (handle, key_hash, created_at) VALUES (?,?,?)').run('house', sha(key), now());
  const house = authenticate(key);
  if (!process.env.HOUSE_KEY) console.log(`house account key (shown once): ${key}`);
  createService(house, {
    name: 'Wikipedia article titles', mode: 'webhook', tags: ['wikipedia', 'search', 'lookup'],
    description: 'Returns the titles of the English Wikipedia articles most relevant to a free-text query, best match first. Automated; typically answers in under a second.',
    endpoint_url: `${PUBLIC_URL}/builtin/wikipedia-titles`, health_url: `${PUBLIC_URL}/healthz`,
    input_schema: { type: 'object', required: ['query'], additionalProperties: false, properties: { query: { type: 'string', minLength: 1, maxLength: 300, description: 'What to look up' }, limit: { type: 'integer', minimum: 1, maximum: 10, description: 'How many titles (default 5)' } } },
    output_schema: { type: 'object', required: ['titles'], properties: { titles: { type: 'array', items: { type: 'string' } } } },
    example_input: { query: 'history of the transistor', limit: 3 },
  });
  createService(house, {
    name: 'Rate an image 1-10', mode: 'queue', tags: ['human', 'image', 'rating', 'judgment'],
    description: 'A person looks at the image at the given URL and rates its overall visual quality from 1 (poor) to 10 (excellent). Answered by a human, so it is only available while a rater is online.',
    input_schema: { type: 'object', required: ['image_url'], additionalProperties: false, properties: { image_url: { type: 'string', format: 'uri', description: 'Publicly reachable image URL' } } },
    output_schema: { type: 'object', required: ['rating'], additionalProperties: false, properties: { rating: { type: 'integer', minimum: 1, maximum: 10 } } },
    example_input: { image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png' },
    timeout_ms: 600_000,
  });
}

// ---------- http ----------
const api = {
  meta: () => ({
    brand: BRAND, base_url: PUBLIC_URL, mcp_url: `${PUBLIC_URL}/mcp`,
    counts: {
      services: q('SELECT count(*) n FROM services').get().n,
      available: q('SELECT * FROM services').all().filter((s) => isAvailable(s)).length,
      calls: q('SELECT count(*) n FROM calls').get().n,
    },
  }),
  createAccount, listServices, serviceDetail, createService, updateService, callService, getCall, nextTask, submitResult, reviewCall, authenticate,
};
const ctx = { BRAND, PUBLIC_URL };

const routes = [
  ['GET', /^\/healthz$/, () => ({ ok: true })],
  ['GET', /^\/v1\/meta$/, () => api.meta()],
  ['POST', /^\/v1\/accounts$/, (c) => [201, createAccount(c.body, c.ip)]],
  ['GET', /^\/v1\/me$/, (c) => {
    const a = requireAccount(c.account);
    return { handle: a.handle, services: q('SELECT * FROM services WHERE owner_id = ? ORDER BY created_at DESC').all(a.id).map(present) };
  }],
  ['GET', /^\/v1\/services$/, (c) => listServices({ q: c.query.get('q'), available: ['1', 'true'].includes(c.query.get('available')), mode: c.query.get('mode'), limit: c.query.get('limit') })],
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
  ['POST', /^\/v1\/calls\/([^/]+)\/review$/, (c, id) => [201, reviewCall(c.account, id, c.body)]],
  ['POST', /^\/builtin\/wikipedia-titles$/, (c) => wikipediaTitles(c.body?.input)],
  ['POST', /^\/mcp$/, (c) => handleMcp(c.body, c.account, api, ctx, c.signal)],
  ['GET', /^\/openapi\.json$/, () => openapi(ctx)],
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.png': 'image/png' };
const SEC = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; img-src 'self' https: http: data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};
function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.join(DIR, 'public', path.normalize(rel));
  if (!file.startsWith(path.join(DIR, 'public') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  let data = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html') data = Buffer.from(data.toString('utf8').replaceAll('{{BRAND}}', BRAND.replace(/[<>&"]/g, '')));
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache', ...SEC });
  res.end(data);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 600_000) { reject(new Err(413, 'too_large', 'Request body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!size) return resolve(undefined);
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
      return res.end(llmsTxt(ctx));
    }
    const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
    if (!route) {
      if (req.method === 'GET' && serveStatic(res, url.pathname)) return;
      if (url.pathname === '/mcp') return send(405, { error: { code: 'method_not_allowed', message: 'POST JSON-RPC to /mcp' } }, { allow: 'POST' });
      throw new Err(404, 'not_found', `No route ${req.method} ${url.pathname}. See /llms.txt or /openapi.json`);
    }
    const ip = req.headers['fly-client-ip'] || req.socket.remoteAddress || '?';
    limit(`ip:${ip}`, 600, 60_000);
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    const c = { ip, query: url.searchParams, account: authenticate(bearer), signal: ac.signal, body: ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : undefined };
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
