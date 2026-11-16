// End-to-end smoke test: boots the server on a temp DB plus a fake provider webhook.
// Run: node test/smoke.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const PORT = 18080, HOOK = 18081, BASE = `http://127.0.0.1:${PORT}`;
const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-')), 'test.db');
let lastHook = null, hookMode = 'ok', callbacks = [];
const hook = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(204); return res.end(); }
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    if (req.url === '/cb') { callbacks.push(JSON.parse(b)); res.writeHead(204); return res.end(); }
    lastHook = { body: b, sig: req.headers['x-market-signature'] };
    const { input } = JSON.parse(b);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(hookMode === 'bad' ? { upper: 42 } : { upper: input.text.toUpperCase() }));
  });
}).listen(HOOK);

const srv = spawn(process.execPath, ['--no-warnings', 'server.js'], {
  cwd: path.join(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT, DB_PATH: dbPath, ALLOW_PRIVATE: '1', PUBLIC_URL: BASE, BRAND: 'TestBrand', HOUSE_KEY: 'mk_house', PROBE_MS: '1000', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test' },
});
await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('listening') && r()));

const call = async (method, p, body, key) => {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
};
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };

try {
  let provider, agent, secret;
  await t('meta + seed', async () => {
    const m = await call('GET', '/v1/meta');
    assert.equal(m.json.brand, 'TestBrand');
    assert.equal(m.json.counts.services, 3);
  });
  await t('accounts', async () => {
    provider = (await call('POST', '/v1/accounts', { handle: 'provider' })).json.api_key;
    agent = (await call('POST', '/v1/accounts', { handle: 'agent' })).json.api_key;
    assert.match(provider, /^mk_/);
    assert.equal((await call('POST', '/v1/accounts', { handle: 'agent' })).status, 409);
    assert.equal((await call('POST', '/v1/accounts', { handle: 'x' })).status, 422);
    assert.equal((await call('GET', '/v1/me')).status, 401);
  });
  const svc = { name: 'Uppercase text', description: 'Returns the text in upper case.', mode: 'webhook', tags: ['text'], endpoint_url: `http://127.0.0.1:${HOOK}/hook`,
    input_schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } }, additionalProperties: false },
    output_schema: { type: 'object', required: ['upper'], properties: { upper: { type: 'string' } } }, example_input: { text: 'hi' } };
  await t('publish webhook service', async () => {
    assert.equal((await call('POST', '/v1/services', svc)).status, 401);
    assert.equal((await call('POST', '/v1/services', { ...svc, input_schema: { type: 'wat' } }, provider)).status, 422);
    assert.equal((await call('POST', '/v1/services', { ...svc, example_input: { text: 1 } }, provider)).status, 422);
    const r = await call('POST', '/v1/services', svc, provider);
    assert.equal(r.status, 201);
    assert.equal(r.json.service.slug, 'uppercase-text');
    assert.equal(r.json.service.input_summary, '{text: string}');
    secret = r.json.webhook_secret;
    assert.match(secret, /^whsec_/);
  });
  await t('probe marks it available and ranks it', async () => {
    await new Promise((r) => setTimeout(r, 2500));
    const r = await call('GET', '/v1/services?q=uppercase&available=1');
    assert.equal(r.json.services.length, 1);
    assert.equal(r.json.services[0].available, true);
    assert.ok(r.json.services[0].stats.uptime_7d > 0);
    const all = (await call('GET', '/v1/services')).json.services;
    assert.equal(all.at(-1).slug, 'rate-an-image-1-10'); // offline queue service sorts last
    assert.equal(all.at(-1).available, false);
  });
  let callId;
  await t('webhook call: validation, signature, output', async () => {
    assert.equal((await call('POST', '/v1/services/uppercase-text/call', { input: { text: 'a' } })).status, 401);
    const bad = await call('POST', '/v1/services/uppercase-text/call', { input: { text: 5, extra: 1 } }, agent);
    assert.equal(bad.status, 422);
    assert.equal(bad.json.error.details.length, 2);
    const r = await call('POST', '/v1/services/uppercase-text/call', { input: { text: 'hello' } }, agent);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.output, { upper: 'HELLO' });
    callId = r.json.call_id;
    assert.equal(lastHook.sig, 'sha256=' + crypto.createHmac('sha256', secret).update(lastHook.body).digest('hex'));
    hookMode = 'bad';
    const v = await call('POST', '/v1/services/uppercase-text/call', { input: { text: 'hello' } }, agent);
    assert.equal(v.status, 502);
    assert.match(v.json.error.message, /output_schema/);
    hookMode = 'ok';
  });
  await t('reviews: caller only, once, updates stats', async () => {
    assert.equal((await call('POST', `/v1/calls/${callId}/review`, { rating: 5 }, provider)).status, 404);
    assert.equal((await call('POST', `/v1/calls/${callId}/review`, { rating: 9 }, agent)).status, 422);
    assert.equal((await call('POST', `/v1/calls/${callId}/review`, { rating: 4, comment: 'fine' }, agent)).status, 201);
    assert.equal((await call('POST', `/v1/calls/${callId}/review`, { rating: 4 }, agent)).status, 409);
    const d = (await call('GET', '/v1/services/uppercase-text')).json;
    assert.equal(d.service.stats.rating, 4);
    assert.equal(d.service.stats.calls, 2);
    assert.equal(d.service.stats.success_rate, 0.5);
    assert.equal(d.reviews[0].handle, 'agent');
  });
  await t('queue service: offline -> 503, worker presence, long-poll roundtrip', async () => {
    const input = { image_url: 'https://example.com/a.png' };
    const off = await call('POST', '/v1/services/rate-an-image-1-10/call', { input }, agent);
    assert.equal(off.status, 503);
    assert.equal((await call('GET', '/v1/services/rate-an-image-1-10/tasks/next?wait_ms=0', null, agent)).status, 403);
    const poll = call('GET', '/v1/services/rate-an-image-1-10/tasks/next?wait_ms=5000', null, 'mk_house');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await call('GET', '/v1/services/rate-an-image-1-10')).json.service.available, true);
    const pending = call('POST', '/v1/services/rate-an-image-1-10/call', { input, wait_ms: 5000 }, agent);
    const task = await poll;
    assert.equal(task.status, 200);
    assert.deepEqual(task.json.input, input);
    const wrong = await call('POST', `/v1/calls/${task.json.call_id}/result`, { output: { rating: 11 } }, 'mk_house');
    assert.equal(wrong.status, 422);
    assert.equal((await call('POST', `/v1/calls/${task.json.call_id}/result`, { output: { rating: 7 } }, agent)).status, 404);
    assert.equal((await call('POST', `/v1/calls/${task.json.call_id}/result`, { output: { rating: 7 } }, 'mk_house')).status, 200);
    const done = await pending;
    assert.equal(done.status, 200);
    assert.deepEqual(done.json.output, { rating: 7 });
    assert.equal((await call('POST', `/v1/calls/${task.json.call_id}/result`, { output: { rating: 7 } }, 'mk_house')).status, 409);
  });
  await t('queue: 202 then poll', async () => {
    const hb = call('GET', '/v1/services/rate-an-image-1-10/tasks/next?wait_ms=0', null, 'mk_house'); // heartbeat only
    assert.equal((await hb).status, 204);
    const r = await call('POST', '/v1/services/rate-an-image-1-10/call', { input: { image_url: 'https://example.com/b.png' }, wait_ms: 100 }, agent);
    assert.equal(r.status, 202);
    assert.equal(r.json.status, 'pending');
    const task = await call('GET', '/v1/services/rate-an-image-1-10/tasks/next?wait_ms=1000', null, 'mk_house');
    await call('POST', `/v1/calls/${task.json.call_id}/result`, { error: 'image did not load' }, 'mk_house');
    const g = await call('GET', `/v1/calls/${r.json.call_id}?wait_ms=1000`, null, agent);
    assert.equal(g.json.status, 'failed');
    assert.equal((await call('GET', `/v1/calls/${r.json.call_id}`, null, provider)).status, 404);
  });
  await t('owner controls', async () => {
    assert.equal((await call('PATCH', '/v1/services/uppercase-text', { status: 'paused' }, agent)).status, 403);
    assert.equal((await call('PATCH', '/v1/services/uppercase-text', { status: 'paused' }, provider)).json.service.available, false);
    assert.equal((await call('POST', '/v1/services/uppercase-text/call', { input: { text: 'a' } }, agent)).status, 503);
    assert.equal((await call('GET', '/v1/me', null, provider)).json.services.length, 1);
  });
  await t('mcp', async () => {
    const rpc = (method, params, key) => call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method, params }, key);
    assert.equal((await rpc('initialize', { protocolVersion: '2025-06-18' })).json.result.serverInfo.name, 'TestBrand');
    assert.equal((await call('POST', '/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    assert.equal((await rpc('tools/list')).json.result.tools.length, 7);
    await call('PATCH', '/v1/services/uppercase-text', { status: 'active' }, provider);
    const s = await rpc('tools/call', { name: 'search_services', arguments: { query: 'uppercase', available_only: false } });
    assert.equal(s.json.result.structuredContent.services[0].slug, 'uppercase-text');
    const c = await rpc('tools/call', { name: 'call_service', arguments: { slug: 'uppercase-text', input: { text: 'mcp' }, api_key: agent } });
    assert.deepEqual(c.json.result.structuredContent.output, { upper: 'MCP' });
    const e = await rpc('tools/call', { name: 'call_service', arguments: { slug: 'uppercase-text', input: { text: 'mcp' } } });
    assert.equal(e.json.result.isError, true);
  });
  await t('docs + static', async () => {
    assert.match(await (await fetch(BASE + '/llms.txt')).text(), /TestBrand/);
    assert.equal((await call('GET', '/openapi.json')).json.openapi, '3.1.0');
    assert.equal((await fetch(BASE + '/../server.js')).status, 404);
    assert.equal((await fetch(BASE + '/%2e%2e/server.js')).status, 404);
  });
  await t('uploads', async () => {
    const up = (type, body, key) => fetch(BASE + '/v1/uploads', { method: 'POST', headers: { 'content-type': type, ...(key ? { authorization: `Bearer ${key}` } : {}) }, body });
    assert.equal((await up('image/png', 'x')).status, 401);
    assert.equal((await up('text/html', '<script>', provider)).status, 415);
    const r = await up('image/png', Buffer.from([137, 80, 78, 71]), provider);
    assert.equal(r.status, 201);
    const { url, bytes } = await r.json();
    assert.equal(bytes, 4);
    const f = await fetch(url);
    assert.equal(f.headers.get('content-type'), 'image/png');
    assert.equal((await f.arrayBuffer()).byteLength, 4);
    assert.equal((await fetch(BASE + '/files/..%2ftest.db')).status, 404);
  });
  const bal = async (key) => (await call('GET', '/v1/billing', null, key)).json.balance_cents;
  await t('pricing: accept, hold, pay out minus fee, refund on failure', async () => {
    assert.equal((await call('PATCH', '/v1/services/uppercase-text', { price_cents: 2000 }, provider)).json.service.price_cents, 2000);
    const input = { text: 'paid' };
    assert.equal((await call('POST', '/v1/services/uppercase-text/call', { input }, agent)).json.error.code, 'price_not_accepted');
    assert.equal((await call('POST', '/v1/services/uppercase-text/call', { input, max_price_cents: 2000 }, agent)).json.error.code, 'insufficient_funds');
    assert.equal((await call('POST', '/v1/admin/credit', { handle: 'agent', amount_cents: 5000 }, agent)).status, 403);
    assert.equal((await call('POST', '/v1/admin/credit', { handle: 'agent', amount_cents: 5000 }, 'mk_house')).json.balance_cents, 5000);
    const ok = await call('POST', '/v1/services/uppercase-text/call', { input, max_price_cents: 2500, callback_url: `http://127.0.0.1:${HOOK}/cb` }, agent);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.price_cents, 2000);
    assert.equal(await bal(agent), 3000);
    assert.equal(await bal(provider), 1800); // 10% fee
    hookMode = 'bad';
    assert.equal((await call('POST', '/v1/services/uppercase-text/call', { input, max_price_cents: 2000 }, agent)).status, 502);
    hookMode = 'ok';
    assert.equal(await bal(agent), 3000); // refunded
    assert.equal(await bal(provider), 1800);
    assert.equal((await call('POST', '/v1/services/uppercase-text/call', { input }, provider)).status, 200); // owner calls free
    assert.equal((await call('GET', '/v1/services?max_price_cents=0')).json.services.some((x) => x.slug === 'uppercase-text'), false);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(callbacks.length, 1);
    assert.deepEqual(callbacks[0].output, { upper: 'PAID' });
    assert.equal((await call('GET', '/v1/calls', null, agent)).json.calls[0].price_cents, 2000);
  });
  await t('payouts: earnings only, reject refunds', async () => {
    assert.equal((await call('POST', '/v1/billing/payouts', { amount_cents: 2500, destination: 'pay@example.com' }, provider)).status, 422);
    assert.equal((await call('POST', '/v1/billing/payouts', { amount_cents: 1000, destination: 'pay@example.com' }, agent)).status, 422); // granted funds are not earnings
    const p = await call('POST', '/v1/billing/payouts', { amount_cents: 1000, destination: 'pay@example.com' }, provider);
    assert.equal(p.status, 201);
    assert.equal(await bal(provider), 800);
    assert.equal((await call('POST', '/v1/billing/payouts', { amount_cents: 1000, destination: 'pay@example.com' }, provider)).status, 422);
    assert.equal((await call('GET', '/v1/admin/payouts', null, 'mk_house')).json.payouts[0].handle, 'provider');
    assert.equal((await call('POST', `/v1/admin/payouts/${p.json.id}`, { status: 'rejected' }, 'mk_house')).status, 200);
    assert.equal(await bal(provider), 1800);
  });
  await t('stripe webhook: signed, idempotent', async () => {
    assert.equal((await call('GET', '/v1/meta')).json.payments_enabled, true);
    const me = (await call('GET', '/v1/me', null, agent)).json;
    const raw = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { payment_status: 'paid', amount_total: 700, metadata: { account_id: '3' } } } });
    const ts = Math.floor(Date.now() / 1000);
    const send = (sig) => fetch(BASE + '/v1/billing/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': sig }, body: raw });
    assert.equal((await send(`t=${ts},v1=deadbeef`)).status, 400);
    const sig = `t=${ts},v1=` + crypto.createHmac('sha256', 'whsec_test').update(`${ts}.${raw}`).digest('hex');
    assert.equal((await send(sig)).status, 200);
    assert.equal((await send(sig)).status, 200);
    assert.equal(me.handle, 'agent');
    assert.equal(await bal(agent), 3700); // account id 3 = agent (house 1, provider 2)
  });
  await t('workers share an inbox', async () => {
    const w = (await call('POST', '/v1/accounts', { handle: 'rater2' })).json.api_key;
    const slug = 'rate-an-image-1-10';
    assert.equal((await call('GET', `/v1/services/${slug}/tasks/next?wait_ms=0`, null, w)).status, 403);
    assert.equal((await call('POST', `/v1/services/${slug}/workers`, { handle: 'rater2' }, agent)).status, 403);
    assert.equal((await call('POST', `/v1/services/${slug}/workers`, { handle: 'rater2' }, 'mk_house')).status, 201);
    assert.equal((await call('GET', '/v1/me', null, w)).json.works_for[0].slug, slug);
    assert.equal((await call('GET', `/v1/services/${slug}/tasks/next?wait_ms=0`, null, w)).status, 204);
    const d = (await call('GET', `/v1/services/${slug}`)).json.service;
    assert.equal(d.available, true);
    assert.ok(d.stats.workers_online >= 1);
    assert.equal((await call('GET', `/v1/services/${slug}/workers`, null, 'mk_house')).json.workers[0].online, true);
    const pending = call('POST', `/v1/services/${slug}/call`, { input: { image_url: 'https://example.com/c.png' }, wait_ms: 3000 }, agent);
    const task = await call('GET', `/v1/services/${slug}/tasks/next?wait_ms=2000`, null, w);
    assert.equal((await call('POST', `/v1/calls/${task.json.call_id}/result`, { output: { rating: 3 } }, w)).status, 200);
    assert.deepEqual((await pending).json.output, { rating: 3 });
    assert.equal((await call('DELETE', `/v1/services/${slug}/workers/rater2`, null, 'mk_house')).status, 204);
    assert.equal((await call('GET', `/v1/services/${slug}/tasks/next?wait_ms=0`, null, w)).status, 403);
  });
  await t('reports and moderation', async () => {
    assert.equal((await call('POST', '/v1/services/uppercase-text/report', { reason: 'nope' }, agent)).status, 422);
    assert.equal((await call('POST', '/v1/services/uppercase-text/report', { reason: 'spam' }, provider)).status, 403);
    assert.equal((await call('POST', '/v1/services/uppercase-text/report', { reason: 'spam', detail: 'x' }, agent)).status, 201);
    assert.equal((await call('POST', '/v1/services/uppercase-text/report', { reason: 'spam' }, agent)).status, 409);
    assert.equal((await call('GET', '/v1/admin/reports', null, agent)).status, 403);
    const r = (await call('GET', '/v1/admin/reports', null, 'mk_house')).json.reports;
    assert.equal(r[0].service, 'uppercase-text');
    assert.equal((await call('POST', `/v1/admin/reports/${r[0].id}/resolve`, { action: 'suspend' }, 'mk_house')).status, 200);
    assert.equal((await call('GET', '/v1/services?q=uppercase')).json.services.length, 0);
    assert.equal((await call('POST', '/v1/services/uppercase-text/call', { input: { text: 'a' }, max_price_cents: 2000 }, agent)).status, 503);
    assert.equal((await call('PATCH', '/v1/services/uppercase-text', { status: 'active' }, provider)).status, 403);
    assert.equal((await call('POST', '/v1/admin/services/uppercase-text/status', { status: 'active' }, 'mk_house')).json.service.status, 'active');
  });
  await t('storefront', async () => {
    assert.equal((await call('GET', '/v1/meta')).json.storefront, null);
    assert.equal((await call('GET', '/v1/meta?storefront=creative')).json.storefront.brand, 'Make Art For Me');
    const viaHost = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: PORT, path: '/v1/meta', headers: { host: 'makeartforme.com' } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(JSON.parse(b))); }));
    assert.equal(viaHost.brand, 'Make Art For Me');
    assert.equal(viaHost.base_url, 'https://makeartforme.com');
    assert.equal(viaHost.storefront.market_url, BASE);
    assert.equal((await call('GET', '/v1/services?media=1')).json.services.length, 0);
    const art = await call('POST', '/v1/services', { name: 'Ink drawings', description: 'Hand-drawn ink illustrations.', mode: 'queue', price_cents: 4000, timeout_ms: 604800000,
      input_schema: { type: 'object', required: ['brief'], properties: { brief: { type: 'string' } } },
      output_schema: { type: 'object', required: ['image_url'], properties: { image_url: { type: 'string', format: 'uri', contentMediaType: 'image/*' } } } }, provider);
    assert.deepEqual(art.json.service.media, ['image']);
    assert.equal(art.json.service.price_cents, 4000);
    assert.equal((await call('GET', '/v1/services?media=1')).json.services.length, 1);
  });
  await t('delete', async () => {
    assert.equal((await call('DELETE', '/v1/services/uppercase-text', null, provider)).status, 204);
    assert.equal((await call('GET', '/v1/services/uppercase-text')).status, 404);
  });
  console.log(`\n${n} groups passed`);
} catch (e) {
  console.error('\nFAILED:', e);
  process.exitCode = 1;
} finally {
  srv.kill();
  hook.close();
}
