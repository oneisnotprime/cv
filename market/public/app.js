'use strict';
(() => {
  /* =========================================================================
   * Helpers
   * ======================================================================= */
  const main = document.getElementById('main');
  const enc = encodeURIComponent;
  let uid = 0;

  // Tiny DOM builder. Never uses innerHTML; strings become text nodes.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = true;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    add(el, kids);
    return el;
  }
  function add(el, ...kids) {
    for (const c of kids) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) add(el, ...c);
      else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function fill(el, ...kids) { el.replaceChildren(); return add(el, kids); }

  function safeUrl(u) {
    if (typeof u !== 'string' || u.length > 4096) return null;
    try {
      const url = new URL(u);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch { return null; }
  }
  function extLink(u, label) {
    const url = safeUrl(u);
    if (!url) return h('span', { class: 'mono' }, label || String(u));
    return h('a', { href: url.href, target: '_blank', rel: 'noopener noreferrer' }, label || url.href);
  }

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isAbort = (e) => !!e && (e.name === 'AbortError' || e.code === 'aborted');
  const pretty = (v) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

  function fmtMs(ms) { const r = fmtMs0(ms); return r.replace(/\.0 /, ' '); }
  function fmtMs0(ms) {
    ms = num(ms);
    if (ms == null) return '—';
    if (ms < 1000) return Math.round(ms) + ' ms';
    if (ms < 60000) return (ms < 10000 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)) + ' s';
    if (ms < 3600000) return (ms < 600000 ? (ms / 60000).toFixed(1) : Math.round(ms / 60000)) + ' min';
    if (ms < 86400000) return (ms < 36000000 ? (ms / 3600000).toFixed(1) : Math.round(ms / 3600000)) + ' h';
    return (ms < 864000000 ? (ms / 86400000).toFixed(1) : Math.round(ms / 86400000)) + ' d';
  }
  function fmtPct(x) {
    x = num(x);
    if (x == null) return '—';
    const p = x * 100;
    return (p >= 100 ? '100' : (Math.floor(p * 10) / 10).toFixed(1)) + '%';
  }
  const fmtNum = (n) => (num(n) == null ? '—' : n.toLocaleString('en-US'));
  function fmtRating(r, n) {
    if (num(r) == null) return 'no reviews';
    return r.toFixed(1) + ' (' + fmtNum(n || 0) + ')';
  }
  function fmtAgo(ts) {
    ts = num(ts);
    if (ts == null) return '—';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 0) return 'in ' + fmtMs(-s * 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return new Date(ts).toISOString().slice(0, 10);
  }
  function fmtClock(ms) {
    if (ms <= 0) return '0:00';
    if (ms >= 86400000) return Math.floor(ms / 86400000) + 'd ' + Math.floor((ms % 86400000) / 3600000) + 'h';
    if (ms >= 3600000) return Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
    const t = Math.ceil(ms / 1000);
    const m = Math.floor(t / 60), s = t % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', onAbort); resolve(); }, ms);
      function onAbort() { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }
  // AbortController that also aborts when the parent signal aborts.
  function linked(parent) {
    const c = new AbortController();
    if (parent) {
      if (parent.aborted) c.abort();
      else parent.addEventListener('abort', () => c.abort(), { once: true });
    }
    return c;
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch { /* fall through */ }
    const ta = h('textarea', { class: 'offscreen', readonly: true });
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
  function copyBtn(get, label = 'Copy') {
    const b = h('button', { type: 'button', class: 'btn btn-sm' }, label);
    b.addEventListener('click', () => {
      copyText(typeof get === 'function' ? get() : String(get)).then((ok) => {
        b.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(() => { b.textContent = label; }, 1500);
      });
    });
    return b;
  }
  function codeBlock(text, label) {
    return h('div', { class: 'code' }, h('pre', label ? { 'aria-label': label } : null, h('code', null, text)), copyBtn(text));
  }
  function errorBox(err, prefix) {
    const msg = (err && err.message) || String(err);
    const box = h('div', { class: 'alert alert-error', role: 'alert' }, h('strong', null, (prefix || 'Error') + ': '), msg);
    const d = err && err.details;
    if (Array.isArray(d) && d.length) {
      box.appendChild(h('ul', null, d.map((x) => h('li', { class: 'mono' }, typeof x === 'string' ? x : pretty(x)))));
    } else if (d != null && !Array.isArray(d)) {
      box.appendChild(h('pre', { class: 'small' }, typeof d === 'string' ? d : pretty(d)));
    }
    if (err && err.status === 401) {
      box.appendChild(h('p', null, 'Authentication required. ', h('a', { href: '#/account' }, 'Go to Account'), ' to create an account or paste an API key.'));
    }
    return box;
  }
  const okBox = (...kids) => h('div', { class: 'alert alert-ok', role: 'status' }, kids);

  function statusOf(s) { return s.status === 'paused' ? 'paused' : s.available ? 'available' : 'offline'; }
  const STATUS_LABEL = { available: 'Available now', offline: 'Offline', paused: 'Paused' };
  function statusTag(s, big) {
    const st = statusOf(s);
    return h('span', { class: 'status status-' + st + (big ? ' status-big' : '') }, h('span', { class: 'dot', 'aria-hidden': 'true' }), STATUS_LABEL[st]);
  }
  function modeBadge(mode) {
    return mode === 'queue'
      ? h('span', { class: 'badge', title: 'Answered by people in a task inbox' }, 'Human')
      : h('span', { class: 'badge', title: 'Answered automatically by a webhook' }, 'API');
  }
  function tagList(tags) {
    if (!Array.isArray(tags) || !tags.length) return null;
    return h('ul', { class: 'tags', 'aria-label': 'Tags' }, tags.slice(0, 12).map((t) => h('li', null, String(t))));
  }
  function ioLine(s) {
    return h('code', { class: 'io' }, h('span', null, s.input_summary || '—'), h('span', { class: 'arrow' }, '→'), h('span', null, s.output_summary || '—'));
  }

  /* =========================================================================
   * Storage + API client
   * ======================================================================= */
  const KEY_NAME = 'market_api_key';
  let memKey = null;
  function getKey() { try { return localStorage.getItem(KEY_NAME) || memKey; } catch { return memKey; } }
  function setKey(k) { memKey = k; try { localStorage.setItem(KEY_NAME, k); } catch { /* memory only */ } mePromise = null; }
  function clearKey() { memKey = null; try { localStorage.removeItem(KEY_NAME); } catch { /* ignore */ } mePromise = null; S.me = null; S.meErr = null; }

  class ApiError extends Error {
    constructor(status, code, message, details, body) {
      super(message);
      this.status = status; this.code = code; this.details = details; this.body = body;
    }
  }

  // Returns {status, data}. Throws ApiError for non-2xx unless the status is in opts.ok.
  async function api(method, path, body, opts = {}) {
    const headers = { Accept: 'application/json' };
    const key = 'key' in opts ? opts.key : getKey();
    if (key) headers.Authorization = 'Bearer ' + key;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: opts.signal });
    } catch (e) {
      if (isAbort(e)) throw e;
      throw new ApiError(0, 'network_error', 'Network error — could not reach the server.');
    }
    let data = null;
    if (res.status !== 204) {
      const text = await res.text();
      if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    }
    if (!res.ok && !(opts.ok || []).includes(res.status)) {
      const e = (data && isObj(data.error)) ? data.error : {};
      throw new ApiError(res.status, e.code || 'http_' + res.status, e.message || ('HTTP ' + res.status + ' ' + res.statusText), e.details, data);
    }
    return { status: res.status, data };
  }

  /* =========================================================================
   * Shared state: meta + current account
   * ======================================================================= */
  const S = { meta: null, me: null, meErr: null };
  const brandEl = document.getElementById('brand');
  const initialBrand = (brandEl.textContent || '').includes('{{') ? '' : brandEl.textContent.trim();
  const brand = () => (S.meta && S.meta.brand) || initialBrand;
  const baseUrl = () => String((S.meta && S.meta.base_url) || location.origin).replace(/\/+$/, '');
  function setTitle(page) { const b = brand(); document.title = page ? page + (b ? ' · ' + b : '') : b; }

  let metaPromise = null;
  function loadMeta(force) {
    if (!metaPromise || force) {
      metaPromise = api('GET', '/v1/meta').then((r) => {
        if (isObj(r.data)) S.meta = r.data;
        if (S.meta && S.meta.brand) brandEl.textContent = S.meta.brand;
        return S.meta;
      }, () => { metaPromise = null; return S.meta; });
    }
    return metaPromise;
  }

  let mePromise = null;
  function loadMe(force) {
    if (!getKey()) { S.me = null; S.meErr = null; updateNav(); return Promise.resolve(null); }
    if (!mePromise || force) {
      mePromise = api('GET', '/v1/me').then((r) => {
        S.me = isObj(r.data) ? r.data : null; S.meErr = null; updateNav(); return S.me;
      }, (e) => {
        S.me = null; S.meErr = e; if (e.status !== 401) mePromise = null; updateNav(); return null;
      });
    }
    return mePromise;
  }
  const isOwner = (s) => !!(S.me && s && S.me.handle === s.owner);

  function updateNav(hash) {
    const navAcc = document.getElementById('nav-account');
    navAcc.textContent = S.me && S.me.handle ? '@' + S.me.handle : 'Account';
    const h0 = hash || location.hash || '#/';
    const cur = h0.startsWith('#/publish') ? 'publish' : h0.startsWith('#/account') ? 'account' : (h0 === '#/' || h0 === '#' || h0 === '') ? 'directory' : '';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* =========================================================================
   * Router
   * ======================================================================= */
  const routes = [
    [/^#?\/?$/, viewDirectory],
    [/^#\/s\/([^/?]+)$/, viewDetail],
    [/^#\/publish$/, viewPublish],
    [/^#\/work\/([^/?]+)$/, viewWork],
    [/^#\/account$/, viewAccount],
  ];
  let current = null;

  function route() {
    const hash = location.hash || '#/';
    if (hash === '#main') return; // skip-link target, not a route
    if (current) current.leave();
    const ctrl = new AbortController();
    const cleanups = [];
    const ctx = {
      signal: ctrl.signal,
      interval(fn, ms) { const t = setInterval(fn, ms); cleanups.push(() => clearInterval(t)); return t; },
      onLeave(fn) { cleanups.push(fn); },
      leave() { ctrl.abort(); cleanups.splice(0).forEach((f) => { try { f(); } catch { /* ignore */ } }); },
    };
    current = ctx;
    updateNav(hash);
    main.replaceChildren();
    let view = viewNotFound, params = [];
    for (const [re, fn] of routes) {
      const m = hash.match(re);
      if (m) { view = fn; params = m.slice(1); break; }
    }
    try { params = params.map((p) => decodeURIComponent(p)); } catch { view = viewNotFound; }
    Promise.resolve().then(() => view(ctx, ...params)).catch((e) => {
      if (isAbort(e) || ctx.signal.aborted) return;
      main.appendChild(errorBox(e));
    });
    window.scrollTo(0, 0);
  }

  function viewNotFound() {
    setTitle('Not found');
    add(main, h('div', { class: 'panel empty' }, h('h1', null, 'Not found'), h('p', null, 'No view at this address.'), h('a', { class: 'btn', href: '#/' }, 'Back to directory')));
  }

  /* =========================================================================
   * Directory  #/
   * ======================================================================= */
  const dirState = { q: '', available: false, mode: '' };

  function quickStart() {
    const b = baseUrl();
    return [
      '# 1. Create an account (the API key is shown once)',
      `curl -sS -X POST ${b}/v1/accounts \\`,
      `  -H 'Content-Type: application/json' -d '{"handle":"my-agent"}'`,
      'export API_KEY=...   # from the response',
      '',
      '# 2. Search services that are available right now',
      `curl -sS '${b}/v1/services?q=image+rating&available=1'`,
      '',
      '# 3. Call one (input must match its input_schema)',
      `curl -sS -X POST ${b}/v1/services/SLUG/call \\`,
      `  -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \\`,
      `  -d '{"input":{"image_url":"https://example.org/cat.jpg"}}'`,
    ].join('\n');
  }

  async function viewDirectory(ctx) {
    setTitle('Directory');
    const counts = h('p', { class: 'counts mono' });
    const agents = h('section', { class: 'panel agents', 'aria-labelledby': 'agents-h' });
    const intro = h('div', { class: 'intro' },
      h('section', { class: 'panel' },
        h('h1', null, 'Service directory'),
        h('p', { class: 'lede' }, 'Typed data-in/data-out services — answered by a webhook or by people working a task inbox — that AI agents can search and call instead of asking their user.'),
        h('p', { class: 'muted small' }, 'Every listing declares input and output JSON Schemas. Ranking puts services that are available right now first; ratings come only from callers of completed calls.'),
        counts),
      agents);

    function renderCounts() {
      const c = (S.meta && S.meta.counts) || {};
      fill(counts, h('b', null, fmtNum(num(c.services))), ' services · ',
        h('b', { class: 'avail-count' }, fmtNum(num(c.available))), ' available now · ',
        h('b', null, fmtNum(num(c.calls))), ' calls');
    }
    function renderAgents() {
      const mcp = S.meta && S.meta.mcp_url;
      fill(agents,
        h('h2', { id: 'agents-h' }, 'For agents'),
        h('dl', { class: 'kv' },
          h('dt', null, 'MCP server'), h('dd', null, mcp ? [h('code', null, String(mcp)), ' ', copyBtn(String(mcp))] : h('span', { class: 'muted' }, '—')),
          h('dt', null, 'Docs'), h('dd', null, h('a', { class: 'mono', href: '/llms.txt' }, '/llms.txt'), ' · ', h('a', { class: 'mono', href: '/openapi.json' }, '/openapi.json'))),
        h('details', { open: window.innerWidth > 860 }, h('summary', null, 'Quick start (curl)'), codeBlock(quickStart(), 'Quick start')));
    }

    const qIn = h('input', { type: 'search', id: 'dir-q', placeholder: 'name, description, tag…', autocomplete: 'off', value: dirState.q });
    const avIn = h('input', { type: 'checkbox', id: 'dir-av', checked: dirState.available });
    const modeSel = h('select', { id: 'dir-mode' },
      h('option', { value: '' }, 'All'), h('option', { value: 'webhook' }, 'API (webhook)'), h('option', { value: 'queue' }, 'Human (queue)'));
    modeSel.value = dirState.mode;
    const controls = h('form', { class: 'controls', role: 'search', onsubmit: (e) => { e.preventDefault(); load(false); } },
      h('div', { class: 'field grow' }, h('label', { for: 'dir-q' }, 'Search'), qIn),
      h('div', { class: 'field' }, h('label', { for: 'dir-mode' }, 'Mode'), modeSel),
      h('div', { class: 'field' }, h('label', { class: 'inline', for: 'dir-av' }, avIn, 'Available now only')));
    const info = h('span', { 'aria-live': 'polite' });
    const refreshNote = h('span');
    const errSlot = h('div');
    const list = h('ul', { class: 'svc-list', 'aria-label': 'Services' });
    add(main, intro, controls, h('div', { class: 'listmeta' }, info, refreshNote), errSlot, list);

    renderCounts(); renderAgents();
    loadMeta().then(() => { if (!ctx.signal.aborted) { renderCounts(); renderAgents(); } });

    let reqCtrl = null, rendered = false, lastCount = -1;
    async function load(isRefresh) {
      if (reqCtrl) reqCtrl.abort();
      const c = linked(ctx.signal);
      reqCtrl = c;
      const p = new URLSearchParams();
      if (dirState.q) p.set('q', dirState.q);
      if (dirState.available) p.set('available', '1');
      if (dirState.mode) p.set('mode', dirState.mode);
      p.set('limit', '100');
      try {
        const { data } = await api('GET', '/v1/services?' + p.toString(), undefined, { signal: c.signal });
        const items = data && Array.isArray(data.services) ? data.services : [];
        renderList(items);
        if (items.length !== lastCount || !isRefresh) info.textContent = items.length + (items.length === 1 ? ' service' : ' services');
        lastCount = items.length;
        refreshNote.textContent = 'updated ' + new Date().toLocaleTimeString() + ' · auto-refresh 10s';
        errSlot.replaceChildren();
        rendered = true;
      } catch (e) {
        if (isAbort(e)) return;
        if (isRefresh && rendered) refreshNote.textContent = 'refresh failed: ' + e.message;
        else fill(errSlot, errorBox(e, 'Could not load services'));
      }
    }

    function renderList(items) {
      const active = document.activeElement;
      const focusSlug = active && list.contains(active) && active.dataset ? active.dataset.slug : null;
      const y = window.scrollY;
      list.replaceChildren(...items.filter(isObj).map(svcRow));
      if (!items.length) list.appendChild(emptyState());
      if (focusSlug) {
        const el = Array.from(list.querySelectorAll('a[data-slug]')).find((a) => a.dataset.slug === focusSlug);
        if (el) el.focus({ preventScroll: true });
      }
      window.scrollTo(0, y);
    }

    function emptyState() {
      const filtered = dirState.q || dirState.available || dirState.mode;
      return h('li', { class: 'empty' }, filtered
        ? [h('p', null, 'No services match these filters' + (dirState.available ? ' right now' : '') + '.'),
          h('button', { type: 'button', class: 'btn', onclick: () => {
            dirState.q = ''; dirState.available = false; dirState.mode = '';
            qIn.value = ''; avIn.checked = false; modeSel.value = ''; load(false);
          } }, 'Clear filters')]
        : [h('p', null, 'No services are listed yet.'), h('a', { class: 'btn btn-primary', href: '#/publish' }, 'Publish the first one')]);
    }

    let deb = null;
    qIn.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(() => { dirState.q = qIn.value.trim(); load(false); }, 250);
    });
    ctx.onLeave(() => clearTimeout(deb));
    avIn.addEventListener('change', () => { dirState.available = avIn.checked; load(false); });
    modeSel.addEventListener('change', () => { dirState.mode = modeSel.value; load(false); });
    ctx.interval(() => {
      if (document.hidden) return;
      load(true);
      loadMeta(true).then(() => { if (!ctx.signal.aborted) renderCounts(); });
    }, 10000);
    await load(false);
  }

  function svcRow(s) {
    const st = isObj(s.stats) ? s.stats : {};
    const stat = (label, value, title) => h('div', { class: 'stat', title: title || null }, h('dt', null, label), h('dd', null, value));
    return h('li', { class: 'svc st-' + statusOf(s) },
      h('div', null, statusTag(s)),
      h('div', null,
        h('div', { class: 'svc-head' },
          h('a', { class: 'svc-name', href: '#/s/' + enc(s.slug), 'data-slug': s.slug }, s.name || s.slug),
          modeBadge(s.mode),
          h('span', { class: 'muted small' }, 'by ' + (s.owner || '?'))),
        s.description ? h('p', { class: 'svc-desc' }, s.description) : null,
        ioLine(s),
        tagList(s.tags)),
      h('dl', { class: 'svc-stats' },
        stat('Rating', fmtRating(st.rating, st.reviews), 'Average of verified reviews (count)'),
        stat('Median', fmtMs(st.p50_ms), 'Median response time'),
        stat('Uptime 7d', fmtPct(st.uptime_7d)),
        stat('Calls', fmtNum(st.calls)),
        s.mode === 'queue' ? stat('Pending', fmtNum(st.pending), 'Tasks waiting for a worker') : h('div')));
  }

  /* =========================================================================
   * Detail  #/s/:slug
   * ======================================================================= */
  function curlFor(s) {
    let body;
    try { body = JSON.stringify({ input: s.example_input !== undefined && s.example_input !== null ? s.example_input : {} }); } catch { body = '{"input":{}}'; }
    const q = body.replace(/'/g, `'\\''`);
    return [
      `curl -sS -X POST ${baseUrl()}/v1/services/${enc(s.slug)}/call \\`,
      `  -H "Authorization: Bearer $API_KEY" \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -d '${q}'`,
    ].join('\n');
  }

  async function viewDetail(ctx, slug) {
    setTitle(slug);
    const [r] = await Promise.all([
      api('GET', '/v1/services/' + enc(slug), undefined, { signal: ctx.signal }),
      loadMe(),
    ]);
    if (ctx.signal.aborted) return;
    const s = r.data && isObj(r.data.service) ? r.data.service : null;
    if (!s) throw new Error('Malformed response for service.');
    const reviews = r.data && Array.isArray(r.data.reviews) ? r.data.reviews : [];
    const st = isObj(s.stats) ? s.stats : {};
    setTitle(s.name || slug);

    const stat = (label, value) => h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value));
    add(main,
      h('nav', { class: 'crumb', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/' }, '← Directory')),
      h('div', { class: 'dhead' }, h('h1', null, s.name || s.slug), statusTag(s, true), modeBadge(s.mode)),
      h('p', { class: 'muted small mono' }, s.slug + ' · by ' + (s.owner || '?') + ' · listed ' + fmtAgo(s.created_at)),
      tagList(s.tags),
      s.description ? h('p', { class: 'desc', style: 'margin-top:8px' }, s.description) : null);

    if (isOwner(s)) main.appendChild(ownerBar(ctx, s));

    add(main, h('dl', { class: 'statgrid', style: 'margin-top:12px' },
      stat('Status', STATUS_LABEL[statusOf(s)]),
      stat('Rating', fmtRating(st.rating, st.reviews)),
      stat('Calls', fmtNum(st.calls)),
      stat('Success', fmtPct(st.success_rate)),
      stat('Median (p50)', fmtMs(st.p50_ms)),
      stat('p95', fmtMs(st.p95_ms)),
      stat('Uptime 7d', fmtPct(st.uptime_7d)),
      s.mode === 'queue' ? stat('Pending', fmtNum(st.pending)) : stat('Last check', fmtAgo(st.last_checked_at)),
      stat('Timeout', fmtMs(s.timeout_ms))));

    add(main, h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', null, 'Input schema'), h('p', null, h('code', { class: 'io' }, s.input_summary || '—')), codeBlock(pretty(s.input_schema), 'Input schema')),
      h('section', { class: 'panel' }, h('h2', null, 'Output schema'), h('p', null, h('code', { class: 'io' }, s.output_summary || '—')), codeBlock(pretty(s.output_schema), 'Output schema'))));

    const reviewsList = h('ul', { class: 'reviews' });
    function renderReviews(list) {
      fill(reviewsList, list.length ? list.filter(isObj).map((rv) => h('li', { class: 'review' },
        h('div', { class: 'row' }, h('b', { class: 'mono' }, (num(rv.rating) != null ? rv.rating : '?') + '/5'), h('span', null, rv.handle ? '@' + rv.handle : 'anonymous'), h('span', { class: 'muted small' }, fmtAgo(rv.created_at))),
        rv.comment ? h('p', null, String(rv.comment)) : null))
        : h('li', { class: 'muted' }, 'No reviews yet. Only callers of a finished call can review it.'));
    }
    renderReviews(reviews);
    async function reloadReviews() {
      try {
        const rr = await api('GET', '/v1/services/' + enc(slug), undefined, { signal: ctx.signal });
        if (rr.data && Array.isArray(rr.data.reviews)) renderReviews(rr.data.reviews);
      } catch { /* keep old list */ }
    }

    add(main, h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', null, 'Call it'), h('p', { class: 'muted small' }, 'Set API_KEY to your key from Account.'), codeBlock(curlFor(s), 'curl example'),
        h('h2', { style: 'margin-top:12px' }, 'Reviews (' + fmtNum(st.reviews || reviews.length) + ')'), reviewsList),
      tryPanel(ctx, s, reloadReviews)));
  }

  function ownerBar(ctx, s) {
    const err = h('div');
    const paused = s.status === 'paused';
    const toggle = h('button', { type: 'button', class: 'btn' }, paused ? 'Resume' : 'Pause');
    toggle.addEventListener('click', async () => {
      toggle.disabled = true; err.replaceChildren();
      try {
        await api('PATCH', '/v1/services/' + enc(s.slug), { status: paused ? 'active' : 'paused' }, { signal: ctx.signal });
        route();
      } catch (e) { if (!isAbort(e)) { err.appendChild(errorBox(e)); toggle.disabled = false; } }
    });
    const del = h('button', { type: 'button', class: 'btn btn-danger' }, 'Delete');
    del.addEventListener('click', async () => {
      if (!window.confirm('Delete "' + (s.name || s.slug) + '"? This removes the listing permanently.')) return;
      del.disabled = true; err.replaceChildren();
      try {
        await api('DELETE', '/v1/services/' + enc(s.slug), undefined, { signal: ctx.signal });
        loadMe(true);
        location.hash = '#/account';
      } catch (e) { if (!isAbort(e)) { err.appendChild(errorBox(e)); del.disabled = false; } }
    });
    return h('section', { class: 'panel owner-bar', style: 'margin-top:12px', 'aria-label': 'Owner controls' },
      h('div', { class: 'row' },
        h('b', null, 'You own this service.'),
        s.mode === 'queue' ? h('a', { class: 'btn btn-primary', href: '#/work/' + enc(s.slug) }, 'Open worker console') : null,
        h('span', { class: 'spacer' }), toggle, del),
      s.mode === 'queue' ? h('p', { class: 'muted small', style: 'margin:6px 0 0' }, 'The service is "available now" only while a worker console is online.') : null,
      err);
  }

  function tryPanel(ctx, s, onReviewed) {
    const hasEx = s.example_input !== undefined && s.example_input !== null;
    const ta = h('textarea', { id: 'try-input', rows: 8, spellcheck: 'false' });
    ta.value = pretty(hasEx ? s.example_input : {});
    const hint = h('div', { class: 'hint', 'aria-live': 'polite' });
    const qOff = s.mode === 'queue' ? h('input', { type: 'checkbox', id: 'try-qoff' }) : null;
    const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Call');
    const stopBtn = h('button', { type: 'button', class: 'btn', hidden: true }, 'Stop waiting');
    const out = h('div');
    let pollCtrl = null;
    const validate = () => {
      try { JSON.parse(ta.value); hint.className = 'hint good'; hint.textContent = 'Valid JSON'; ta.removeAttribute('aria-invalid'); return true; }
      catch (e) { hint.className = 'hint bad'; hint.textContent = 'Invalid JSON: ' + e.message; ta.setAttribute('aria-invalid', 'true'); return false; }
    };
    ta.addEventListener('input', validate);
    stopBtn.addEventListener('click', () => { if (pollCtrl) pollCtrl.abort(); });

    const form = h('form', { class: 'panel', 'aria-labelledby': 'try-h' },
      h('h2', { id: 'try-h' }, 'Try it'),
      getKey() ? null : h('div', { class: 'alert alert-warn' }, 'Calls require an API key. ', h('a', { href: '#/account' }, 'Create one or sign in'), '.'),
      h('div', { class: 'field' }, h('label', { for: 'try-input' }, 'input (JSON)'), ta, hint),
      qOff ? h('div', { class: 'field' }, h('label', { class: 'inline', for: 'try-qoff' }, qOff, 'Queue the task even if no worker is online')) : null,
      h('div', { class: 'row' }, btn, stopBtn),
      out);

    form.addEventListener('submit', (e) => { e.preventDefault(); run().catch(() => {}); });

    async function run() {
      if (!validate()) return;
      const input = JSON.parse(ta.value);
      if (pollCtrl) pollCtrl.abort();
      pollCtrl = linked(ctx.signal);
      const sig = pollCtrl.signal;
      const line = h('p', { class: 'callstatus mono', 'aria-live': 'polite' }, 'Calling…');
      fill(out, line);
      btn.disabled = true;
      const t0 = Date.now();
      let call = null, tick = null;
      try {
        const body = { input, wait_ms: 20000 };
        if (qOff && qOff.checked) body.queue_if_offline = true;
        const r = await api('POST', '/v1/services/' + enc(s.slug) + '/call', body, { signal: sig, ok: [502] });
        call = isObj(r.data) ? r.data : {};
        if (call.status === 'pending' || call.status === 'claimed') {
          stopBtn.hidden = false;
          const show = () => {
            line.textContent = (call.status === 'claimed' ? 'claimed — a worker is answering' : 'pending — waiting for a worker') +
              ' · ' + fmtMs(Date.now() - t0) + ' elapsed · call ' + call.call_id;
          };
          show();
          tick = setInterval(show, 1000);
          let backoff = 1000;
          while (call.status === 'pending' || call.status === 'claimed') {
            try {
              const g = await api('GET', '/v1/calls/' + enc(call.call_id) + '?wait_ms=25000', undefined, { signal: sig });
              if (isObj(g.data) && g.data.status) call = Object.assign({}, call, g.data);
              backoff = 1000;
              show();
            } catch (e) {
              if (isAbort(e) || (e.status && e.status < 500)) throw e;
              line.textContent = 'connection problem, retrying in ' + fmtMs(backoff) + ' · call ' + call.call_id;
              await sleep(backoff, sig);
              backoff = Math.min(backoff * 2, 30000);
            }
          }
        }
        showResult(call, Date.now() - t0);
      } catch (e) {
        if (isAbort(e)) {
          if (!ctx.signal.aborted) {
            line.textContent = call && call.call_id
              ? 'Stopped waiting. The call continues; check it with GET /v1/calls/' + call.call_id
              : 'Stopped.';
          }
          return;
        }
        line.textContent = '';
        out.appendChild(errorBox(e, e.code === 'service_unavailable' ? 'Unavailable' : 'Call failed'));
        if (e.code === 'service_unavailable' && qOff) out.appendChild(h('p', { class: 'muted small' }, 'No worker is online. Tick "Queue the task even if no worker is online" to leave it in the inbox.'));
      } finally {
        if (tick) clearInterval(tick);
        btn.disabled = false; stopBtn.hidden = true;
      }

      function showResult(c, elapsed) {
        const lat = num(c.latency_ms) != null ? c.latency_ms : elapsed;
        line.textContent = (c.status || 'unknown') + ' · ' + fmtMs(lat) + (c.call_id ? ' · call ' + c.call_id : '');
        if (c.status === 'done') {
          add(out, h('h3', null, 'Output'), h('div', { class: 'inputview' }, renderValue('output', c.output, 0, s.output_schema)),
            h('details', null, h('summary', { class: 'small' }, 'Raw JSON'), codeBlock(pretty(c.output), 'Output')));
        } else {
          const er = c.error;
          const msg = isObj(er) ? (er.message || er.code || pretty(er)) : er ? String(er) : c.status === 'timeout' ? 'No answer before the timeout.' : 'The call did not complete.';
          out.appendChild(errorBox({ message: msg, details: isObj(er) ? er.details : undefined }, c.status === 'timeout' ? 'Timed out' : 'Failed'));
        }
        if (c.call_id && !c.reviewed && ['done', 'failed', 'timeout'].includes(c.status)) {
          out.appendChild(reviewForm(ctx, c.call_id, onReviewed));
        }
      }
    }
    return form;
  }

  function reviewForm(ctx, callId, onDone) {
    let rating = 0;
    const id = 'rv-' + (++uid);
    const btns = [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: 'btn choice', 'aria-pressed': 'false', 'aria-label': n + ' of 5' }, String(n)));
    btns.forEach((b, i) => b.addEventListener('click', () => {
      rating = i + 1;
      btns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
    }));
    const comment = h('textarea', { id, rows: 2, maxlength: 1000, class: 'prose' });
    const err = h('div');
    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Submit review');
    const form = h('form', { class: 'panel', style: 'margin-top:12px' },
      h('fieldset', null, h('legend', null, 'Review this call (1 = bad, 5 = excellent)'), h('div', { class: 'btnrow', role: 'group' }, btns)),
      h('div', { class: 'field' }, h('label', { for: id }, 'Comment (optional)'), comment),
      submit, err);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.replaceChildren();
      if (!rating) { err.appendChild(errorBox({ message: 'Choose a rating from 1 to 5.' })); return; }
      submit.disabled = true;
      try {
        const body = { rating };
        if (comment.value.trim()) body.comment = comment.value.trim();
        await api('POST', '/v1/calls/' + enc(callId) + '/review', body, { signal: ctx.signal });
        fill(form, okBox('Review recorded. Thank you.'));
        if (onDone) onDone();
      } catch (ex) {
        if (isAbort(ex)) return;
        submit.disabled = false;
        err.appendChild(errorBox(ex));
      }
    });
    return form;
  }

  /* =========================================================================
   * Publish  #/publish
   * ======================================================================= */
  const TEMPLATES = {
    rating: {
      label: 'Human image rating (queue)',
      name: 'Rate an image 1–10',
      description: 'A person looks at the image and returns an integer rating from 1 (poor) to 10 (excellent) for overall visual quality.',
      tags: 'image, rating, human',
      mode: 'queue',
      input_schema: { type: 'object', properties: { image_url: { type: 'string', format: 'uri', description: 'Publicly reachable http(s) image URL' } }, required: ['image_url'], additionalProperties: false },
      output_schema: { type: 'object', properties: { rating: { type: 'integer', minimum: 1, maximum: 10, description: '1 = poor, 10 = excellent' } }, required: ['rating'], additionalProperties: false },
      example_input: { image_url: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg' },
      timeout_ms: 3600000,
    },
    wiki: {
      label: 'Wikipedia article titles (webhook)',
      name: 'Wikipedia article titles',
      description: 'Returns titles of English Wikipedia articles relevant to a free-text query, most relevant first.',
      tags: 'wikipedia, search, text',
      mode: 'webhook',
      input_schema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['query'], additionalProperties: false },
      output_schema: { type: 'object', properties: { titles: { type: 'array', items: { type: 'string' }, maxItems: 10 } }, required: ['titles'], additionalProperties: false },
      example_input: { query: 'history of the transistor', limit: 5 },
    },
    artwork: {
      label: 'Human-made artwork (queue, 7 d)',
      name: 'Commissioned artwork',
      description: 'An artist creates an original image from your brief and returns a link to the finished file, optionally with a short note. Allow up to 7 days.',
      tags: 'art, illustration, image, human',
      mode: 'queue',
      input_schema: { type: 'object', properties: {
        brief: { type: 'string', minLength: 1, maxLength: 4000, description: 'What to depict, format, intended use' },
        style: { type: 'string', maxLength: 500, description: 'Style or medium, e.g. "flat vector", "watercolor"' },
        reference_url: { type: 'string', format: 'uri', description: 'Optional reference image' },
      }, required: ['brief'], additionalProperties: false },
      output_schema: { type: 'object', properties: {
        image_url: { type: 'string', format: 'uri', contentMediaType: 'image/*', description: 'The finished artwork' },
        artist_note: { type: 'string', maxLength: 2000 },
      }, required: ['image_url'], additionalProperties: false },
      example_input: { brief: 'A lighthouse at dusk for a book cover, portrait orientation', style: 'gouache' },
      timeout_ms: 7 * 86400000,
    },
    music: {
      label: 'Human-written music (queue, 7 d)',
      name: 'Original music track',
      description: 'A musician writes and records an original piece from your brief and returns a link to the audio file. Allow up to 7 days.',
      tags: 'music, audio, composition, human',
      mode: 'queue',
      input_schema: { type: 'object', properties: {
        brief: { type: 'string', minLength: 1, maxLength: 4000, description: 'What the piece is for and how it should feel' },
        duration_seconds: { type: 'integer', minimum: 5, maximum: 600 },
        mood: { type: 'string', maxLength: 200 },
      }, required: ['brief'], additionalProperties: false },
      output_schema: { type: 'object', properties: {
        audio_url: { type: 'string', format: 'uri', contentMediaType: 'audio/*', description: 'The finished track' },
        title: { type: 'string', maxLength: 200 },
      }, required: ['audio_url'], additionalProperties: false },
      example_input: { brief: 'Intro sting for a technical podcast', duration_seconds: 15, mood: 'calm, curious' },
      timeout_ms: 7 * 86400000,
    },
  };

  const QUEUE_TIMEOUTS = [[600000, '10 minutes'], [3600000, '1 hour'], [86400000, '24 hours'], [7 * 86400000, '7 days'], [30 * 86400000, '30 days']];

  function jsonField(id, label, rows, opts = {}) {
    const ta = h('textarea', { id, rows, spellcheck: 'false', 'aria-describedby': id + '-hint' });
    const hint = h('div', { class: 'hint', id: id + '-hint', 'aria-live': 'polite' });
    const check = () => {
      const v = ta.value.trim();
      if (!v) {
        ta.removeAttribute('aria-invalid');
        hint.className = opts.required ? 'hint bad' : 'hint';
        hint.textContent = opts.required ? 'Required.' : 'Optional.';
        return { ok: !opts.required, value: undefined };
      }
      try {
        const val = JSON.parse(v);
        if (opts.schema && !isObj(val)) throw new Error('a schema must be a JSON object');
        let note = 'Valid JSON';
        if (opts.schema) {
          const props = isObj(val.properties) ? Object.keys(val.properties) : [];
          note += ' · type ' + (val.type || '?') + (props.length ? ' · properties: ' + props.join(', ') : '');
          if (val.type !== 'object') note += ' · note: top-level type "object" is recommended';
        }
        ta.removeAttribute('aria-invalid'); hint.className = 'hint good'; hint.textContent = note;
        return { ok: true, value: val };
      } catch (e) {
        ta.setAttribute('aria-invalid', 'true'); hint.className = 'hint bad'; hint.textContent = 'Invalid: ' + e.message;
        return { ok: false, error: label + ': ' + e.message };
      }
    };
    ta.addEventListener('input', check);
    const el = h('div', { class: 'field' }, h('label', { for: id }, label), ta, hint);
    return { el, ta, check, set(v) { ta.value = v === undefined ? '' : pretty(v); check(); } };
  }

  async function viewPublish(ctx) {
    setTitle('Publish');
    await loadMe();
    if (ctx.signal.aborted) return;
    const f = {
      name: h('input', { type: 'text', id: 'p-name', required: true, maxlength: 80, autocomplete: 'off' }),
      description: h('textarea', { id: 'p-desc', rows: 3, class: 'prose', maxlength: 2000 }),
      tags: h('input', { type: 'text', id: 'p-tags', placeholder: 'image, rating', autocomplete: 'off' }),
      endpoint: h('input', { type: 'url', id: 'p-endpoint', placeholder: 'https://example.com/hooks/my-service' }),
      health: h('input', { type: 'url', id: 'p-health', placeholder: 'https://example.com/health' }),
      timeout: h('input', { type: 'number', id: 'p-timeout', min: 100, step: 100, placeholder: 'server default' }),
      allowed: h('select', { id: 'p-allowed' }, QUEUE_TIMEOUTS.map(([ms, label]) => h('option', { value: String(ms) }, label))),
    };
    const inS = jsonField('p-in', 'input_schema', 9, { required: true, schema: true });
    const outS = jsonField('p-out', 'output_schema', 9, { required: true, schema: true });
    const ex = jsonField('p-ex', 'example_input', 4);
    const modeRadio = (val, title, text) => h('label', { class: 'radio-opt' },
      h('input', { type: 'radio', name: 'p-mode', value: val, checked: val === 'webhook' }),
      h('span', null, h('b', null, title), h('span', { class: 'muted' }, text)));
    const webhookBox = h('fieldset', null, h('legend', null, 'Webhook'),
      h('div', { class: 'field' }, h('label', { for: 'p-endpoint' }, 'endpoint_url (required)'), f.endpoint,
        h('div', { class: 'hint' }, 'Receives each call as an HTTPS POST; responds with the output JSON.')),
      h('div', { class: 'field' }, h('label', { for: 'p-health' }, 'health_url (optional)'), f.health,
        h('div', { class: 'hint' }, 'Polled with GET for uptime and availability; any 2xx counts as up.')));
    f.allowed.value = '3600000';
    const timeoutWebhook = h('div', { class: 'field' }, h('label', { for: 'p-timeout' }, 'timeout_ms (optional)'), f.timeout,
      h('div', { class: 'hint' }, 'How long your endpoint may take before the call fails with status "timeout".'));
    const timeoutQueue = h('div', { class: 'field' }, h('label', { for: 'p-allowed' }, 'Time allowed per task'), f.allowed,
      h('div', { class: 'hint' }, 'How long a queued task may wait for an answer before it times out. Long values suit slow work such as commissions.'));
    const err = h('div');
    const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-big' }, 'Publish service');
    const mode = () => { const r = form.querySelector('input[name="p-mode"]:checked'); return r ? r.value : 'webhook'; };
    const syncMode = () => {
      const wh = mode() === 'webhook';
      webhookBox.hidden = !wh; f.endpoint.required = wh;
      timeoutWebhook.hidden = !wh; timeoutQueue.hidden = wh;
    };

    function applyTemplate(t) {
      f.name.value = t.name; f.description.value = t.description; f.tags.value = t.tags;
      form.querySelectorAll('input[name="p-mode"]').forEach((r) => { r.checked = r.value === t.mode; });
      inS.set(t.input_schema); outS.set(t.output_schema); ex.set(t.example_input);
      if (t.mode === 'queue' && t.timeout_ms) f.allowed.value = String(t.timeout_ms);
      if (t.mode === 'webhook') f.timeout.value = t.timeout_ms ? String(t.timeout_ms) : '';
      syncMode();
      (t.mode === 'webhook' ? f.endpoint : f.name).focus();
    }

    const form = h('form', { class: 'panel', novalidate: true },
      h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'muted' }, 'Start from a template:'),
        Object.values(TEMPLATES).map((t) => h('button', { type: 'button', class: 'btn btn-sm', onclick: () => applyTemplate(t) }, t.label))),
      h('div', { class: 'field' }, h('label', { for: 'p-name' }, 'Name'), f.name),
      h('div', { class: 'field' }, h('label', { for: 'p-desc' }, 'Description'), f.description,
        h('div', { class: 'hint' }, 'What it does, what quality to expect, any limits. Agents read this to decide.')),
      h('div', { class: 'field' }, h('label', { for: 'p-tags' }, 'Tags (comma-separated)'), f.tags),
      h('fieldset', null, h('legend', null, 'Mode'),
        modeRadio('webhook', 'API (webhook)', 'Your server answers each call automatically over HTTPS.'),
        modeRadio('queue', 'Human (queue)', 'Calls wait in a browser inbox; you answer them in the worker console.')),
      webhookBox,
      h('div', { class: 'grid2' }, inS.el, outS.el),
      h('div', { class: 'grid2' }, ex.el,
        h('div', null,
          timeoutWebhook,
          timeoutQueue)),
      h('div', { class: 'row' }, submit),
      err);
    form.addEventListener('change', (e) => { if (e.target && e.target.name === 'p-mode') syncMode(); });
    syncMode(); inS.check(); outS.check(); ex.check();

    add(main, h('h1', null, 'Publish a service'),
      S.me ? h('p', { class: 'muted' }, 'Publishing as @' + S.me.handle + '.')
        : h('div', { class: 'alert alert-warn' }, 'You need an account to publish. ', h('a', { href: '#/account' }, 'Create one or paste your API key'), '.'),
      form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.replaceChildren();
      const problems = [];
      const name = f.name.value.trim();
      if (!name) problems.push('name is required');
      const m = mode();
      const endpoint = f.endpoint.value.trim(), health = f.health.value.trim();
      if (m === 'webhook') {
        if (!safeUrl(endpoint)) problems.push('endpoint_url must be an http(s) URL');
        if (health && !safeUrl(health)) problems.push('health_url must be an http(s) URL');
      }
      const a = inS.check(), b = outS.check(), c = ex.check();
      [a, b, c].forEach((x) => { if (!x.ok) problems.push(x.error || 'schema required'); });
      if (problems.length) { err.appendChild(errorBox({ message: 'Fix these fields.', details: problems })); return; }
      const body = {
        name, description: f.description.value.trim(),
        tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
        mode: m, input_schema: a.value, output_schema: b.value,
      };
      if (c.value !== undefined) body.example_input = c.value;
      if (m === 'webhook') { body.endpoint_url = endpoint; if (health) body.health_url = health; }
      const to = parseInt(m === 'queue' ? f.allowed.value : f.timeout.value, 10);
      if (isFinite(to) && to > 0) body.timeout_ms = to;
      submit.disabled = true;
      try {
        const r = await api('POST', '/v1/services', body, { signal: ctx.signal });
        const svc = r.data && isObj(r.data.service) ? r.data.service : { slug: '', name };
        loadMe(true);
        fill(main, publishedPanel(svc, r.data && r.data.webhook_secret));
        window.scrollTo(0, 0);
      } catch (ex2) {
        if (isAbort(ex2)) return;
        submit.disabled = false;
        err.appendChild(errorBox(ex2, ex2.status === 422 ? 'Rejected' : 'Error'));
        err.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function publishedPanel(svc, secret) {
    const link = svc.slug ? h('a', { href: '#/s/' + enc(svc.slug) }, svc.name || svc.slug) : (svc.name || '');
    if (svc.mode === 'queue' || !secret) {
      return h('section', { class: 'panel' },
        h('h1', null, 'Published'), okBox('Listed: ', link, '.'),
        svc.mode === 'queue' ? [
          h('p', null, 'Human services are "available now" only while a worker console is open and online. Calls that arrive while no one is online fail with service_unavailable unless the caller queues them.'),
          h('a', { class: 'btn btn-primary btn-big', href: '#/work/' + enc(svc.slug) }, 'Open worker console'),
        ] : null);
    }
    const verify = [
      "// Node.js: verify a request before trusting it",
      "const crypto = require('crypto');",
      "const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');",
      "const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-market-signature'] || ''));",
    ].join('\n');
    return h('section', { class: 'panel' },
      h('h1', null, 'Published'), okBox('Listed: ', link, '.'),
      h('h2', null, 'Webhook secret'),
      h('div', { class: 'alert alert-warn' }, h('b', null, 'Save this now. '), 'It is shown once and cannot be retrieved later.'),
      h('div', { class: 'row' }, h('div', { class: 'secret', style: 'flex:1' }, String(secret)), copyBtn(String(secret))),
      h('h2', { style: 'margin-top:16px' }, 'Request format'),
      h('p', null, 'Each call is sent to your endpoint_url as ', h('code', null, 'POST'), ' with JSON body ', h('code', null, '{call_id, service, input}'), ' and header ',
        h('code', null, 'X-Market-Signature: sha256=<hex>'), ', the hex HMAC-SHA256 of the raw request body keyed with the secret above.'),
      h('p', null, 'Respond with status 2xx and the output JSON as the whole response body. It must validate against your output_schema; anything else counts as a failed call.'),
      codeBlock(verify, 'Signature verification'));
  }

  /* =========================================================================
   * Worker console  #/work/:slug
   * ======================================================================= */
  /* =========================================================================
   * Media: rendering by type, uploads
   * ======================================================================= */
  const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
  const AUD_EXT = /\.(mp3|wav|ogg|oga|opus|flac|m4a|aac|mid|midi)$/i;
  const VID_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
  const UPLOAD_MAX = 25 * 1024 * 1024;

  // Decide how to show a URL: schema contentMediaType wins, else file extension, else key name.
  function mediaKind(url, sch, key) {
    const cmt = isObj(sch) && typeof sch.contentMediaType === 'string' ? sch.contentMediaType.toLowerCase() : '';
    if (cmt.startsWith('image/')) return 'image';
    if (cmt.startsWith('audio/')) return 'audio';
    if (cmt.startsWith('video/')) return 'video';
    if (cmt) return null;
    const p = url.pathname;
    if (IMG_EXT.test(p)) return 'image';
    if (AUD_EXT.test(p)) return 'audio';
    if (VID_EXT.test(p)) return 'video';
    if (/image/i.test(key || '')) return 'image';
    return null;
  }
  function mediaEl(kind, href, key) {
    if (kind === 'image') return h('img', { src: href, alt: 'Image from field ' + key, referrerpolicy: 'no-referrer', loading: 'lazy', decoding: 'async' });
    // <audio>/<video> have no referrerpolicy attribute; index.html sets a page-wide no-referrer policy.
    if (kind === 'audio') return h('audio', { src: href, controls: true, preload: 'metadata' });
    if (kind === 'video') return h('video', { src: href, controls: true, preload: 'metadata', playsinline: true });
    return null;
  }

  // Renders untrusted JSON readably. `sch` is the matching (sub)schema when known.
  function renderValue(key, v, depth, sch) {
    if (v === null || v === undefined) return h('span', { class: 'muted mono' }, String(v));
    if (typeof v === 'string') {
      const url = safeUrl(v);
      if (url) {
        const m = mediaEl(mediaKind(url, sch, key), url.href, key);
        return h('div', { class: 'ivalue' }, m, extLink(url.href));
      }
      return h('div', { class: 'ivalue' }, v);
    }
    if (typeof v === 'number' || typeof v === 'boolean') return h('code', null, String(v));
    if (depth > 4) return h('pre', null, pretty(v));
    if (Array.isArray(v)) {
      if (!v.length) return h('span', { class: 'muted mono' }, '[]');
      const itemSch = isObj(sch) ? sch.items : null;
      return h('ol', null, v.map((x) => h('li', null, renderValue(key, x, depth + 1, itemSch))));
    }
    const keys = Object.keys(v);
    if (!keys.length) return h('span', { class: 'muted mono' }, '{}');
    const props = isObj(sch) && isObj(sch.properties) ? sch.properties : {};
    return h('dl', { class: 'kv' }, keys.map((k) => [h('dt', { class: 'mono' }, k), h('dd', null, renderValue(k, v[k], depth + 1, props[k]))]));
  }

  // POST /v1/uploads with raw bytes. XHR (not fetch) for upload progress.
  function uploadFile(file, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/v1/uploads');
      const key = getKey();
      if (key) xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network error during upload.'));
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch { data = null; }
        if (xhr.status >= 200 && xhr.status < 300 && data && typeof data.url === 'string') return resolve(data);
        const e = data && isObj(data.error) ? data.error : {};
        const fallback = { 413: 'File too large (max 25 MB).', 415: 'File type not allowed.', 507: 'Upload storage is full; try again later.' }[xhr.status];
        reject(new ApiError(xhr.status, e.code || 'http_' + xhr.status, e.message || fallback || ('Upload failed (HTTP ' + xhr.status + ')'), e.details, data));
      };
      if (signal) {
        if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }
      xhr.send(file);
    });
  }

  const PRIM = ['string', 'integer', 'number', 'boolean'];
  const typeOf = (sch) => (Array.isArray(sch.type) ? sch.type.find((t) => t !== 'null') : sch.type);
  function isFlat(schema) {
    if (!isObj(schema) || typeOf(schema) !== 'object' || !isObj(schema.properties)) return false;
    const props = Object.values(schema.properties);
    return props.length > 0 && props.every((p) => isObj(p) && (
      'const' in p ||
      (Array.isArray(p.enum) && p.enum.length > 0 && p.enum.every((x) => x === null || typeof x !== 'object')) ||
      PRIM.includes(typeOf(p)) ||
      (typeOf(p) === 'array' && isObj(p.items) && typeOf(p.items) === 'string')));
  }
  function typeHint(p) {
    if ('const' in p) return 'const';
    if (Array.isArray(p.enum)) return 'enum';
    const t = typeOf(p) || 'any';
    const lo = num(p.minimum), hi = num(p.maximum);
    if (lo != null || hi != null) return t + ' ' + (lo != null ? lo : '') + '..' + (hi != null ? hi : '');
    if (t === 'string' && p.contentMediaType) return 'file URL (' + p.contentMediaType + ')';
    if (t === 'string' && p.format) return 'string (' + p.format + ')';
    if (t === 'array') return 'string[]' + (num(p.minItems) != null || num(p.maxItems) != null ? ' ' + (p.minItems || 0) + '..' + (p.maxItems != null ? p.maxItems : '') : '');
    return t;
  }
  function skeleton(sch, d = 0) {
    if (!isObj(sch) || d > 5) return null;
    if ('const' in sch) return sch.const;
    if (Array.isArray(sch.enum)) return sch.enum[0];
    switch (typeOf(sch)) {
      case 'object': {
        const o = {};
        if (isObj(sch.properties)) for (const k of Object.keys(sch.properties)) o[k] = skeleton(sch.properties[k], d + 1);
        return o;
      }
      case 'array': return [];
      case 'string': return '';
      case 'integer': case 'number': return num(sch.minimum) != null ? sch.minimum : 0;
      case 'boolean': return false;
      default: return null;
    }
  }

  // A row of toggle buttons (for enums and small integer ranges).
  function choiceRow(values, labelId) {
    let selected;
    const row = h('div', { class: 'btnrow', role: 'group', 'aria-labelledby': labelId });
    const btns = values.map((v) => h('button', { type: 'button', class: 'btn choice', 'aria-pressed': 'false' }, String(v)));
    const select = (i) => {
      selected = i;
      btns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      if (btns[i]) btns[i].focus();
    };
    btns.forEach((b, i) => b.addEventListener('click', () => select(i)));
    add(row, btns);
    // digit shortcuts: value itself if it is a 0..9 integer; '0' → 10; else 1-based index
    const keys = {};
    const ints = values.every((v) => Number.isInteger(v));
    values.forEach((v, i) => {
      if (ints && v >= 0 && v <= 9) keys[String(v)] = i;
      else if (ints && v === 10 && !values.includes(0)) keys['0'] = i;
      else if (!ints && i < 9) keys[String(i + 1)] = i;
    });
    return { el: row, keys, select, get: () => (selected === undefined ? undefined : values[selected]), focus: () => (btns[0] && btns[0].focus()) };
  }

  function buildField(name, p, required, signal) {
    const id = 'af-' + (++uid);
    const t = typeOf(p);
    const label = h('label', { id: id + '-l', for: id }, h('span', { class: 'fname mono' }, name), required ? h('span', { class: 'req', title: 'required' }, ' *') : null,
      h('span', { class: 'muted mono ftype' }, '  ' + typeHint(p)));
    const desc = p.description ? h('p', { class: 'fdesc muted' }, String(p.description)) : null;
    const wrap = h('div', { class: 'field' }, label, desc);
    const fail = (msg) => ({ ok: false, error: name + ': ' + msg });
    let read, keys = null, choice = null, focus;

    if ('const' in p) {
      wrap.appendChild(h('code', null, pretty(p.const)));
      read = () => ({ ok: true, set: true, value: p.const });
    } else if (Array.isArray(p.enum) || (t === 'integer' && num(p.minimum) != null && num(p.maximum) != null && p.maximum >= p.minimum && p.maximum - p.minimum <= 11)) {
      const values = Array.isArray(p.enum) ? p.enum : Array.from({ length: p.maximum - p.minimum + 1 }, (_, i) => p.minimum + i);
      if (values.length <= 12) {
        label.removeAttribute('for');
        choice = choiceRow(values, id + '-l');
        wrap.appendChild(choice.el);
        keys = choice.keys; focus = choice.focus;
        read = () => { const v = choice.get(); return v === undefined ? (required ? fail('choose a value') : { ok: true, set: false }) : { ok: true, set: true, value: v }; };
      } else {
        const sel = h('select', { id }, h('option', { value: '' }, '— choose —'), values.map((v, i) => h('option', { value: String(i) }, String(v))));
        wrap.appendChild(sel); focus = () => sel.focus();
        read = () => (sel.value === '' ? (required ? fail('choose a value') : { ok: true, set: false }) : { ok: true, set: true, value: values[Number(sel.value)] });
      }
    } else if (t === 'boolean') {
      const cb = h('input', { type: 'checkbox', id: id + '-cb' });
      label.setAttribute('for', id + '-cb');
      wrap.appendChild(h('label', { class: 'inline', for: id + '-cb' }, cb, 'true'));
      focus = () => cb.focus();
      read = () => ({ ok: true, set: true, value: cb.checked });
    } else if (t === 'integer' || t === 'number') {
      const inp = h('input', { type: 'number', id, step: t === 'integer' ? 1 : 'any', min: num(p.minimum), max: num(p.maximum), inputmode: t === 'integer' ? 'numeric' : 'decimal' });
      wrap.appendChild(inp); focus = () => inp.focus();
      read = () => {
        if (inp.value.trim() === '') return required ? fail('required') : { ok: true, set: false };
        const v = Number(inp.value);
        if (!isFinite(v)) return fail('not a number');
        if (t === 'integer' && !Number.isInteger(v)) return fail('must be an integer');
        return { ok: true, set: true, value: v };
      };
    } else if (t === 'string' && p.format === 'uri') {
      const cmt = typeof p.contentMediaType === 'string' ? p.contentMediaType : '';
      const inp = h('input', { type: 'url', id, autocomplete: 'off', placeholder: 'https://…' });
      const fileId = id + '-file';
      const file = h('input', { type: 'file', id: fileId, accept: cmt || null });
      const state = h('div', { class: 'hint', 'aria-live': 'polite' });
      const preview = h('div');
      let busy = false, upCtrl = null;
      const showPreview = () => {
        const url = safeUrl(inp.value.trim());
        fill(preview, url ? renderValue(name, url.href, 0, p) : null);
      };
      inp.addEventListener('change', showPreview);
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        if (f.size > UPLOAD_MAX) { state.className = 'hint bad'; state.textContent = 'File is ' + (f.size / 1048576).toFixed(1) + ' MB; the limit is 25 MB.'; return; }
        if (upCtrl) upCtrl.abort();
        upCtrl = linked(signal);
        busy = true;
        state.className = 'hint'; state.textContent = 'Uploading ' + f.name + '… 0%';
        try {
          const r = await uploadFile(f, (fr) => { state.textContent = 'Uploading ' + f.name + '… ' + Math.round(fr * 100) + '%'; }, upCtrl.signal);
          inp.value = r.url;
          state.className = 'hint good';
          state.textContent = 'Uploaded ' + (r.content_type || f.type || '') + (num(r.bytes) != null ? ', ' + (r.bytes / 1048576).toFixed(2) + ' MB' : '') + '.';
          showPreview();
        } catch (e) {
          if (!isAbort(e)) { state.className = 'hint bad'; state.textContent = 'Upload failed: ' + e.message; }
        } finally { busy = false; file.value = ''; }
      });
      wrap.appendChild(h('div', { class: 'upload' },
        h('label', { class: 'inline', for: fileId }, 'Upload a file' + (cmt ? ' (' + cmt + ')' : '') + ':'), file,
        h('div', { class: 'hint' }, 'Max 25 MB. Or paste a public URL below.')));
      wrap.appendChild(inp); wrap.appendChild(state); wrap.appendChild(preview);
      focus = () => inp.focus();
      read = () => {
        if (busy) return fail('upload still in progress');
        const v = inp.value.trim();
        if (v === '') return required ? fail('required (upload a file or enter a URL)') : { ok: true, set: false };
        if (!safeUrl(v)) return fail('must be an http(s) URL');
        return { ok: true, set: true, value: v };
      };
    } else if (t === 'string') {
      const long = num(p.maxLength) == null || p.maxLength > 200;
      const inp = long
        ? h('textarea', { id, rows: 3, class: 'prose', maxlength: num(p.maxLength) })
        : h('input', { type: 'text', id, maxlength: num(p.maxLength), autocomplete: 'off' });
      wrap.appendChild(inp); focus = () => inp.focus();
      if (p.pattern) wrap.appendChild(h('div', { class: 'hint mono' }, 'pattern: ' + String(p.pattern)));
      read = () => {
        const v = inp.value;
        if (v === '') return required ? fail('required') : { ok: true, set: false };
        return { ok: true, set: true, value: v };
      };
    } else { // array of strings
      const ta = h('textarea', { id, rows: 5, class: 'prose' });
      wrap.appendChild(ta); wrap.appendChild(h('div', { class: 'hint' }, 'One item per line. Empty lines are ignored.'));
      focus = () => ta.focus();
      read = () => {
        const items = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
        if (!items.length && required && !num(p.minItems)) return { ok: true, set: true, value: [] };
        if (!items.length && !required) return { ok: true, set: false };
        return { ok: true, set: true, value: items };
      };
    }
    return { name, el: wrap, read, keys, choice, focus };
  }

  // Returns {el, read() -> {ok, value} | {ok:false, errors}, focus(), keys, choice}
  function buildAnswerForm(schema, signal) {
    if (isFlat(schema)) {
      const req = Array.isArray(schema.required) ? schema.required : [];
      const fields = Object.keys(schema.properties).map((k) => buildField(k, schema.properties[k], req.includes(k), signal));
      const withKeys = fields.find((f) => f.keys && Object.keys(f.keys).length);
      return {
        el: h('div', null, fields.map((f) => f.el)),
        keyField: withKeys || null,
        focus: () => { const f = fields.find((x) => x.focus); if (f) f.focus(); },
        read() {
          const out = {}, errors = [];
          for (const f of fields) {
            const r = f.read();
            if (!r.ok) errors.push(r.error);
            else if (r.set) out[f.name] = r.value;
          }
          return errors.length ? { ok: false, errors } : { ok: true, value: out };
        },
      };
    }
    const id = 'af-' + (++uid);
    const ta = h('textarea', { id, rows: 10, spellcheck: 'false' });
    ta.value = pretty(skeleton(schema));
    return {
      el: h('div', { class: 'field' }, h('label', { for: id }, 'Output (JSON matching the output schema)'), ta,
        h('details', null, h('summary', { class: 'small' }, 'Output schema'), h('pre', { class: 'small' }, pretty(schema)))),
      keyField: null,
      focus: () => ta.focus(),
      read() {
        try { return { ok: true, value: JSON.parse(ta.value) }; } catch (e) { return { ok: false, errors: ['Invalid JSON: ' + e.message] }; }
      },
    };
  }

  async function viewWork(ctx, slug) {
    setTitle('Worker · ' + slug);
    const [r] = await Promise.all([api('GET', '/v1/services/' + enc(slug), undefined, { signal: ctx.signal }), loadMe()]);
    if (ctx.signal.aborted) return;
    const s = r.data && isObj(r.data.service) ? r.data.service : null;
    if (!s) throw new Error('Malformed response for service.');
    setTitle('Worker · ' + (s.name || slug));
    add(main, h('nav', { class: 'crumb', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/s/' + enc(slug) }, '← ' + (s.name || slug))),
      h('h1', null, 'Worker console: ' + (s.name || slug)));
    if (s.mode !== 'queue') {
      add(main, h('div', { class: 'alert alert-warn' }, 'This is a webhook service; it has no task inbox.'));
      return;
    }
    if (!getKey()) { add(main, errorBox({ status: 401, message: 'Sign in to work this inbox.' })); return; }
    if (S.me && !isOwner(s)) {
      add(main, errorBox({ message: 'Only the owner (@' + s.owner + ') can work this inbox. You are signed in as @' + S.me.handle + '.' }));
      return;
    }

    const stateLine = h('div', { class: 'state', 'aria-live': 'polite' });
    const toggle = h('button', { type: 'button', class: 'btn btn-primary btn-big' }, 'Go online');
    const counter = h('span', { class: 'muted small mono' });
    const presence = h('section', { class: 'panel presence' }, stateLine, h('div', null, toggle, h('div', null, counter)));
    const taskSlot = h('div');
    add(main,
      s.status === 'paused' ? h('div', { class: 'alert alert-warn' }, 'This service is paused; agents cannot call it. Resume it on the ', h('a', { href: '#/s/' + enc(slug) }, 'detail page'), '.') : null,
      presence,
      h('p', { class: 'muted small' }, 'While online this page long-polls for tasks; the polling is the presence signal. Keep the tab open. Keys: digits pick a value, ', h('kbd', null, 'Enter'), ' submits (', h('kbd', null, 'Ctrl'), '+', h('kbd', null, 'Enter'), ' inside a text box).'),
      taskSlot);

    let online = false, pollCtrl = null, task = null, answered = 0, looping = false;
    const baseTitle = document.title;
    let flashT = null;
    const stopFlash = () => { if (flashT) { clearInterval(flashT); flashT = null; document.title = baseTitle; } };
    const onVis = () => { if (!document.hidden) stopFlash(); };
    document.addEventListener('visibilitychange', onVis);

    function setState(kind, extra) {
      presence.classList.toggle('is-online', kind === 'online' || kind === 'task');
      const big = (st, label) => h('span', { class: 'status status-big status-' + st }, h('span', { class: 'dot', 'aria-hidden': 'true' }), label);
      if (kind === 'online') fill(stateLine, big('available', 'Online'), h('div', null, 'Agents see this service as available. Waiting for tasks…'));
      else if (kind === 'task') fill(stateLine, big('available', 'Online · task open'), h('div', null, 'Answer the task below; polling resumes after you submit.'));
      else if (kind === 'retry') fill(stateLine, big('offline', 'Reconnecting'), h('div', null, extra));
      else fill(stateLine, big('offline', 'Offline'), h('div', null, extra || 'Not polling. Unless another worker is online, agents see this service as offline.'));
      toggle.textContent = online ? 'Go offline' : 'Go online';
      toggle.className = online ? 'btn btn-big' : 'btn btn-primary btn-big';
      counter.textContent = answered ? answered + ' answered this session' : '';
    }

    async function loop() {
      if (looping) return;
      looping = true;
      let backoff = 1000;
      try {
        while (online && !task && !ctx.signal.aborted) {
          pollCtrl = linked(ctx.signal);
          try {
            const res = await api('GET', '/v1/services/' + enc(slug) + '/tasks/next?wait_ms=25000', undefined, { signal: pollCtrl.signal });
            backoff = 1000;
            if (!online) break;
            if (res.status === 200 && isObj(res.data) && res.data.call_id) { showTask(res.data); break; }
            setState('online');
          } catch (e) {
            if (isAbort(e)) break;
            if ([401, 403, 404].includes(e.status)) {
              online = false; setState('offline', 'Stopped: ' + e.message);
              if (e.status === 401) fill(taskSlot, errorBox(e));
              break;
            }
            setState('retry', e.message + ' — retrying in ' + fmtMs(backoff));
            try { await sleep(backoff, pollCtrl.signal); } catch { break; }
            backoff = Math.min(backoff * 2, 30000);
          }
        }
      } finally { looping = false; }
    }

    function goOnline() { online = true; setState(task ? 'task' : 'online'); if (!task) loop(); }
    function goOffline() { online = false; if (pollCtrl) pollCtrl.abort(); setState('offline'); }
    toggle.addEventListener('click', () => (online ? goOffline() : goOnline()));

    let countT = null, keyHandler = null;
    function endTask() {
      task = null;
      if (countT) { clearInterval(countT); countT = null; }
      if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
      stopFlash();
      taskSlot.replaceChildren();
      if (online) { setState('online'); loop(); } else setState('offline');
    }
    ctx.onLeave(() => {
      online = false;
      if (countT) clearInterval(countT);
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      document.removeEventListener('visibilitychange', onVis);
      stopFlash();
    });

    function showTask(t) {
      task = t;
      setState('task');
      if (document.hidden && !flashT) {
        let on = false;
        flashT = setInterval(() => { on = !on; document.title = on ? '(1) New task' : baseTitle; }, 1000);
      }
      const outSchema = isObj(t.output_schema) ? t.output_schema : s.output_schema;
      const form = buildAnswerForm(outSchema, ctx.signal);
      const cd = h('span', { class: 'countdown' });
      const err = h('div');
      const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-big' }, 'Submit');
      const decline = h('button', { type: 'button', class: 'btn' }, "Can't do this one");
      const skip = h('button', { type: 'button', class: 'btn', hidden: true }, 'Next task');
      const exp = num(t.expires_at);
      const updateCd = () => {
        if (exp == null) { cd.textContent = ''; return; }
        const left = exp - Date.now();
        cd.textContent = left > 0 ? 'expires in ' + fmtClock(left) : 'expired — the caller has timed out';
        cd.classList.toggle('low', left < 15000);
        if (left <= 0) { skip.hidden = false; if (countT) { clearInterval(countT); countT = null; } }
      };
      updateCd();
      countT = setInterval(updateCd, 1000);

      async function post(body, what) {
        err.replaceChildren();
        submit.disabled = decline.disabled = true;
        try {
          await api('POST', '/v1/calls/' + enc(t.call_id) + '/result', body, { signal: ctx.signal });
          if (what === 'answer') answered++;
          endTask();
          taskSlot.appendChild(okBox(what === 'answer' ? 'Submitted.' : 'Declined.'));
        } catch (e) {
          if (isAbort(e)) return;
          submit.disabled = decline.disabled = false;
          err.appendChild(errorBox(e, e.status === 422 ? 'Output rejected — fix and resubmit' : 'Could not submit'));
          if (e.status === 404 || e.status === 409 || e.status === 410) skip.hidden = false;
        }
      }

      const answerForm = h('form', { class: 'answer', novalidate: true }, h('h2', null, 'Your answer'),
        h('p', { class: 'muted small' }, h('code', { class: 'io' }, s.output_summary || 'output'), ' · time allowed ', fmtMs(s.timeout_ms)),
        form.el,
        form.keyField ? h('p', { class: 'hint' }, 'Number keys select ' + form.keyField.name + '.') : null,
        err,
        h('div', { class: 'actions' }, submit, decline, skip));
      answerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const r2 = form.read();
        if (!r2.ok) { fill(err, errorBox({ message: 'Incomplete answer.', details: r2.errors })); return; }
        post({ output: r2.value }, 'answer');
      });
      decline.addEventListener('click', () => {
        const reason = window.prompt('Reason (sent to the caller):', 'declined by worker');
        if (reason === null) return;
        post({ error: reason.trim() || 'declined by worker' }, 'decline');
      });
      skip.addEventListener('click', endTask);

      keyHandler = (e) => {
        if (e.defaultPrevented || e.altKey || e.metaKey) return;
        const tg = e.target;
        const tag = tg && tg.tagName;
        const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && tg.type !== 'checkbox' && tg.type !== 'radio') || tag === 'SELECT';
        if (e.key === 'Enter') {
          if (tag === 'TEXTAREA' && !(e.ctrlKey || e.metaKey)) return;
          if (tg && tg.closest && tg.closest('form') !== answerForm && tag !== 'BODY' && tag !== 'BUTTON') return;
          if (tag === 'BUTTON' && tg !== submit && !tg.classList.contains('choice')) return;
          e.preventDefault();
          if (!submit.disabled) answerForm.requestSubmit ? answerForm.requestSubmit() : answerForm.dispatchEvent(new Event('submit', { cancelable: true }));
          return;
        }
        if (!typing && !e.ctrlKey && form.keyField && e.key in form.keyField.keys) {
          e.preventDefault();
          form.keyField.choice.select(form.keyField.keys[e.key]);
        }
      };
      document.addEventListener('keydown', keyHandler);

      fill(taskSlot, h('section', { class: 'panel task', 'aria-labelledby': 'task-h' },
        h('div', { class: 'task-head' }, h('h2', { id: 'task-h', style: 'margin:0' }, 'Task'), cd,
          h('span', { class: 'muted small mono' }, 'call ' + t.call_id + ' · received ' + fmtAgo(t.created_at))),
        h('div', { class: 'grid2' },
          h('div', { class: 'inputview' }, h('h3', null, 'Input'), renderValue('input', t.input, 0, s.input_schema)),
          answerForm)));
      form.focus();
    }

    setState('offline');
  }

  /* =========================================================================
   * Account  #/account
   * ======================================================================= */
  async function viewAccount(ctx) {
    setTitle('Account');
    await loadMe();
    if (ctx.signal.aborted) return;
    add(main, h('h1', null, 'Account'));
    if (S.me) return renderSignedIn(ctx);
    if (getKey() && S.meErr) {
      add(main, errorBox(S.meErr, S.meErr.status === 401 ? 'Stored key rejected' : 'Could not load account'),
        h('div', { class: 'row', style: 'margin-bottom:12px' },
          S.meErr.status !== 401 ? h('button', { type: 'button', class: 'btn', onclick: () => { loadMe(true).then(() => route()); } }, 'Retry') : null,
          h('button', { type: 'button', class: 'btn', onclick: () => { clearKey(); route(); } }, 'Forget stored key')));
    }

    // create account
    const handle = h('input', { type: 'text', id: 'a-handle', required: true, minlength: 3, maxlength: 32, pattern: '[a-z0-9_\\-]{3,32}', autocomplete: 'username', spellcheck: 'false', 'aria-describedby': 'a-handle-hint' });
    const cErr = h('div');
    const cBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Create account');
    const create = h('form', { class: 'panel', 'aria-labelledby': 'a-create-h' },
      h('h2', { id: 'a-create-h' }, 'Create an account'),
      h('div', { class: 'field' }, h('label', { for: 'a-handle' }, 'Handle'), handle,
        h('div', { class: 'hint', id: 'a-handle-hint' }, '3–32 characters: a–z, 0–9, hyphen, underscore. Public; shown on your services and reviews.')),
      cBtn, cErr);
    create.addEventListener('submit', async (e) => {
      e.preventDefault();
      cErr.replaceChildren();
      const v = handle.value.trim().toLowerCase();
      if (!/^[a-z0-9_-]{3,32}$/.test(v)) { cErr.appendChild(errorBox({ message: 'Handle must be 3–32 characters of a–z, 0–9, "-" or "_".' })); return; }
      cBtn.disabled = true;
      try {
        const r = await api('POST', '/v1/accounts', { handle: v }, { signal: ctx.signal, key: '' });
        const key = r.data && r.data.api_key;
        if (!key) throw new Error('Server did not return an API key.');
        setKey(String(key));
        await loadMe(true);
        fill(main, h('h1', null, 'Account created'), keyShownOnce(String(key), (r.data && r.data.handle) || v));
      } catch (ex) {
        if (isAbort(ex)) return;
        cBtn.disabled = false;
        cErr.appendChild(errorBox(ex));
      }
    });

    // existing key
    const keyIn = h('input', { type: 'password', id: 'a-key', autocomplete: 'off', spellcheck: 'false' });
    const kErr = h('div');
    const kBtn = h('button', { type: 'submit', class: 'btn' }, 'Sign in');
    const signin = h('form', { class: 'panel', 'aria-labelledby': 'a-key-h' },
      h('h2', { id: 'a-key-h' }, 'Use an existing API key'),
      h('div', { class: 'field' }, h('label', { for: 'a-key' }, 'API key'), keyIn,
        h('div', { class: 'hint' }, 'Stored in this browser (localStorage) only.')),
      kBtn, kErr);
    signin.addEventListener('submit', async (e) => {
      e.preventDefault();
      kErr.replaceChildren();
      const k = keyIn.value.trim();
      if (!k) { kErr.appendChild(errorBox({ message: 'Paste your API key.' })); return; }
      kBtn.disabled = true;
      try {
        await api('GET', '/v1/me', undefined, { signal: ctx.signal, key: k });
        setKey(k);
        await loadMe(true);
        route();
      } catch (ex) {
        if (isAbort(ex)) return;
        kBtn.disabled = false;
        kErr.appendChild(errorBox(ex.status === 401 ? { message: 'That key was not accepted.' } : ex));
      }
    });

    add(main, h('div', { class: 'grid2' }, create, signin),
      h('p', { class: 'muted small' }, 'Agents can create their own account with ', h('code', null, 'POST /v1/accounts'), ' — see ', h('a', { href: '/llms.txt' }, '/llms.txt'), '.'));
  }

  function keyShownOnce(key, handle) {
    return h('section', { class: 'panel' },
      okBox('Signed in as @' + handle + '.'),
      h('h2', null, 'Your API key'),
      h('div', { class: 'alert alert-warn' }, h('b', null, 'Save this now. '), 'It is shown once. It is stored in this browser, but if you clear site data or switch devices you will need it.'),
      h('div', { class: 'row' }, h('div', { class: 'secret', style: 'flex:1' }, key), copyBtn(key)),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('a', { class: 'btn btn-primary', href: '#/publish' }, 'Publish a service'),
        h('a', { class: 'btn', href: '#/' }, 'Browse the directory'),
        h('a', { class: 'btn', href: '#/account' }, 'Account')));
  }

  function renderSignedIn(ctx) {
    const me = S.me;
    const key = getKey() || '';
    const masked = key.length > 10 ? key.slice(0, 6) + '…' + key.slice(-4) : '••••';
    const keyEl = h('code', null, masked);
    let shown = false;
    const reveal = h('button', { type: 'button', class: 'btn btn-sm' }, 'Show');
    reveal.addEventListener('click', () => { shown = !shown; keyEl.textContent = shown ? key : masked; reveal.textContent = shown ? 'Hide' : 'Show'; });
    const out = h('button', { type: 'button', class: 'btn btn-danger' }, 'Sign out');
    out.addEventListener('click', () => {
      if (!window.confirm('Sign out? The API key will be removed from this browser. Make sure you have a copy.')) return;
      clearKey(); updateNav(); route();
    });
    const svcs = Array.isArray(me.services) ? me.services.filter(isObj) : [];
    add(main,
      h('section', { class: 'panel' },
        h('dl', { class: 'kv' },
          h('dt', null, 'Handle'), h('dd', null, h('b', null, '@' + me.handle)),
          h('dt', null, 'API key'), h('dd', null, keyEl, ' ', reveal, ' ', copyBtn(() => key))),
        h('div', { class: 'row', style: 'margin-top:10px' }, out)),
      h('section', { class: 'panel' },
        h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'My services'), h('span', { class: 'spacer' }), h('a', { class: 'btn btn-sm btn-primary', href: '#/publish' }, 'Publish')),
        svcs.length
          ? h('ul', { class: 'svc-list', style: 'margin-top:8px' }, svcs.map((s) => h('li', { class: 'svc st-' + statusOf(s) },
            h('div', null, statusTag(s)),
            h('div', null,
              h('div', { class: 'svc-head' }, h('a', { class: 'svc-name', href: '#/s/' + enc(s.slug) }, s.name || s.slug), modeBadge(s.mode)),
              ioLine(s)),
            h('div', null, s.mode === 'queue' ? h('a', { class: 'btn btn-sm', href: '#/work/' + enc(s.slug) }, 'Worker console') : null))))
          : h('p', { class: 'muted', style: 'margin-top:8px' }, 'You have not published any services yet.')));
    void ctx;
  }

  /* =========================================================================
   * Boot
   * ======================================================================= */
  window.addEventListener('unhandledrejection', (e) => { if (isAbort(e.reason)) e.preventDefault(); });
  document.getElementById('skip').addEventListener('click', (e) => { e.preventDefault(); main.focus(); });
  window.addEventListener('hashchange', route);
  loadMeta();
  loadMe();
  route();
})();
