// Outbound HTTP to provider-supplied URLs, hardened against SSRF:
// private/loopback/link-local addresses are refused at DNS-resolution time
// (so DNS rebinding can't slip through), redirects are not followed,
// and responses are size- and time-capped.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1'; // local dev / tests only
const MAX_BODY = 1024 * 1024;

export function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const s = ip.toLowerCase();
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivate(mapped[1]);
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('::ffff:') || s.startsWith('64:ff9b:');
}

function guardedLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = ALLOW_PRIVATE ? addrs : addrs.filter((a) => !isPrivate(a.address));
    if (!ok.length) return cb(Object.assign(new Error('address not allowed'), { code: 'EBLOCKED' }));
    if (options.all) cb(null, ok); else cb(null, ok[0].address, ok[0].family);
  });
}

// Returns an error string, or null if the URL is acceptable as a provider endpoint.
export function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return 'not a valid URL'; }
  if (u.protocol !== 'https:' && !(ALLOW_PRIVATE && u.protocol === 'http:')) return 'must be https';
  if (u.username || u.password) return 'must not contain credentials';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!ALLOW_PRIVATE && (net.isIP(host) ? isPrivate(host) : /(^|\.)(localhost|internal|local)$/i.test(host))) return 'host not allowed';
  if (raw.length > 500) return 'too long';
  return null;
}

export function safeRequest(raw, { method = 'GET', headers = {}, body, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const bad = checkUrl(raw);
    if (bad) return reject(Object.assign(new Error(bad), { code: 'EBLOCKED' }));
    const u = new URL(raw);
    const lib = u.protocol === 'https:' ? https : http;
    const started = Date.now();
    const req = lib.request(u, { method, headers: { ...headers, ...(body ? { 'content-length': Buffer.byteLength(body) } : {}) }, lookup: guardedLookup, agent: false }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { req.destroy(Object.assign(new Error('response too large'), { code: 'ETOOBIG' })); return; }
        chunks.push(c);
      });
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - started }); });
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })), timeout);
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    if (body) req.write(body);
    req.end();
  });
}
