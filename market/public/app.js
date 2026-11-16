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
  // Money is integer cents.
  const fmtUsd = (c) => (num(c) == null ? '—' : (c < 0 ? '−$' : '$') + (Math.abs(c) / 100).toFixed(2));
  const fmtPrice = (c) => (num(c) == null ? '—' : c === 0 ? 'Free' : fmtUsd(c));
  function dollarsToCents(v) {
    const t = String(v == null ? '' : v).trim();
    const n = Number(t);
    return t !== '' && isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  }

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

  function statusOf(s) {
    return s.status === 'suspended' ? 'suspended' : s.status === 'paused' ? 'paused' : s.available ? 'available' : 'offline';
  }
  const statusLabel = (st) => (st === 'available' ? T('availableNow') : { offline: 'Offline', paused: 'Paused', suspended: 'Suspended' }[st] || String(st));
  function statusTag(s, big) {
    const st = statusOf(s);
    return h('span', { class: 'status status-' + st + (big ? ' status-big' : '') }, h('span', { class: 'dot', 'aria-hidden': 'true' }), statusLabel(st));
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
  // Storefront: forced locally with ?storefront=<key> in the page URL; otherwise the server decides by domain.
  const SF_PARAM = (() => { try { return new URLSearchParams(location.search).get('storefront'); } catch { return null; } })();
  const SF = () => (S.meta && isObj(S.meta.storefront) ? S.meta.storefront : null);
  const VOCAB = {
    services: ['Services', 'Artists'], service: ['service', 'artist'],
    availableNow: ['Available now', 'Taking commissions now'],
    tryIt: ['Try it', 'Commission'], call: ['Call', 'Send commission'],
    publish: ['Publish', 'Offer your work'], directory: ['Directory', 'Artists'],
    worker: ['a worker', 'the artist'],
  };
  const T = (k) => (VOCAB[k] ? VOCAB[k][SF() ? 1 : 0] : k);
  const brand = () => (SF() && SF().brand) || (S.meta && S.meta.brand) || initialBrand;
  const baseUrl = () => String((S.meta && S.meta.base_url) || location.origin).replace(/\/+$/, '');
  function setTitle(page) { const b = brand(); document.title = page ? page + (b ? ' · ' + b : '') : b; }

  let metaPromise = null;
  function loadMeta(force) {
    if (!metaPromise || force) {
      metaPromise = api('GET', '/v1/meta' + (SF_PARAM ? '?storefront=' + enc(SF_PARAM) : '')).then((r) => {
        if (isObj(r.data)) S.meta = r.data;
        applyChrome();
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
  const isWorkerOn = (s) => !!(S.me && s && Array.isArray(S.me.works_for) && S.me.works_for.some((w) => isObj(w) && w.slug === s.slug));

  // Brand, nav labels and footer depend on meta (storefront vs general marketplace).
  function applyChrome() {
    const sf = SF();
    if (brand()) brandEl.textContent = brand();
    const nd = document.querySelector('[data-nav="directory"]'), np = document.querySelector('[data-nav="publish"]');
    if (nd) nd.textContent = T('directory');
    if (np) np.textContent = T('publish');
    document.documentElement.classList.toggle('storefront', !!sf);
    const foot = document.getElementById('foot');
    if (foot && sf) {
      fill(foot, h('span', null, brand(), sf.tagline ? ' — ' + sf.tagline : ''),
        h('span', null, 'Part of ', safeUrl(sf.market_url) ? extLink(sf.market_url, sf.market_brand || safeUrl(sf.market_url).host) : (sf.market_brand || ''),
          ' · ', h('a', { href: '/llms.txt' }, '/llms.txt'), ' · ', h('a', { href: '/openapi.json' }, '/openapi.json')));
    }
  }

  function updateNav(hash) {
    const navAcc = document.getElementById('nav-account');
    navAcc.textContent = S.me && S.me.handle ? '@' + S.me.handle : 'Account';
    const bal = document.getElementById('nav-balance');
    const hasBal = !!(S.me && num(S.me.balance_cents) != null);
    if (bal) { bal.hidden = !hasBal; bal.textContent = hasBal ? fmtUsd(S.me.balance_cents) : ''; }
    const adm = document.getElementById('nav-admin');
    if (adm) adm.hidden = !(S.me && S.me.is_admin === true);
    const h0 = (hash || location.hash || '#/').split('?')[0];
    const cur = h0.startsWith('#/publish') ? 'publish' : h0.startsWith('#/account') ? 'account' : h0.startsWith('#/billing') ? 'billing'
      : h0.startsWith('#/admin') ? 'admin' : (h0 === '#/' || h0 === '#' || h0 === '') ? 'directory' : '';
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
    [/^#\/billing$/, viewBilling],
    [/^#\/admin$/, viewAdmin],
    [/^#\/call\/([^/?]+)$/, viewCall],
  ];
  let current = null;

  function route() {
    const full = location.hash || '#/';
    if (full === '#main') return; // skip-link target, not a route
    const qi = full.indexOf('?');
    const hash = qi >= 0 ? full.slice(0, qi) : full;
    if (current) current.leave();
    const ctrl = new AbortController();
    const cleanups = [];
    const ctx = {
      signal: ctrl.signal,
      interval(fn, ms) { const t = setInterval(fn, ms); cleanups.push(() => clearInterval(t)); return t; },
      onLeave(fn) { cleanups.push(fn); },
      leave() { ctrl.abort(); cleanups.splice(0).forEach((f) => { try { f(); } catch { /* ignore */ } }); },
      query: new URLSearchParams(qi >= 0 ? full.slice(qi + 1) : ''),
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
  const dirState = { q: '', available: false, mode: '', media: '' };
  const MEDIA_CHIPS = [['', 'All'], ['image', 'Art'], ['audio', 'Music & audio'], ['video', 'Video']];

  function quickStart() {
    const b = baseUrl();
    return [
      '# 1. Create an account (the API key is shown once)',
      `curl -sS -X POST ${b}/v1/accounts \\`,
      `  -H 'Content-Type: application/json' -d '{"handle":"my-agent"}'`,
      'export API_KEY=...   # from the response',
      '',
      ...(SF() ? ['# 2. Search human-made creative work (artists taking commissions first)',
        `curl -sS '${b}/v1/services?q=illustration&media=1&mode=queue'`]
        : ['# 2. Search services that are available right now',
          `curl -sS '${b}/v1/services?q=image+rating&available=1'`]),
      '',
      '# 3. Call one (input must match its input_schema)',
      `curl -sS -X POST ${b}/v1/services/SLUG/call \\`,
      `  -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \\`,
      `  -d '{"input":{"image_url":"https://example.org/cat.jpg"}}'`,
    ].join('\n');
  }

  async function viewDirectory(ctx) {
    const sf = SF();
    setTitle(T('directory'));
    const counts = h('p', { class: 'counts mono' });
    const agents = h('section', { class: 'panel agents', 'aria-labelledby': 'agents-h' });
    const intro = h('div', { class: 'intro' },
      sf ? h('section', { class: 'panel' },
        h('h1', null, sf.brand || brand()),
        sf.tagline ? h('p', { class: 'lede' }, String(sf.tagline)) : null,
        h('p', null, 'Everything here is made by people, not generated. Each artist sets a price and turnaround; their listing shows typical turnaround, rating from verified buyers, and whether they are taking commissions right now.'),
        counts)
        : h('section', { class: 'panel' },
          h('h1', null, 'Service directory'),
          h('p', { class: 'lede' }, 'Typed data-in/data-out services — answered by a webhook or by people working a task inbox — that AI agents can search and call instead of asking their user.'),
          h('p', { class: 'muted small' }, 'Every listing declares input and output JSON Schemas. Ranking puts services that are available right now first; ratings come only from callers of completed calls.'),
          counts),
      agents);

    let lastItems = [];
    function renderCounts() {
      if (sf) {
        const avail = lastItems.filter((s) => isObj(s) && statusOf(s) === 'available').length;
        fill(counts, h('b', null, fmtNum(lastItems.length)), ' artists · ', h('b', { class: 'avail-count' }, fmtNum(avail)), ' taking commissions now');
        return;
      }
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
        sf ? h('p', { class: 'muted small' }, 'Agents can commission work on a user\'s behalf through the same API: search with media=1&mode=queue, call with max_price_cents, and pass callback_url or poll the call until the artist delivers.') : null,
        h('details', { open: window.innerWidth > 860 }, h('summary', null, 'Quick start (curl)'), codeBlock(quickStart(), 'Quick start')));
    }

    const qIn = h('input', { type: 'search', id: 'dir-q', placeholder: 'name, description, tag…', autocomplete: 'off', value: dirState.q });
    const avIn = h('input', { type: 'checkbox', id: 'dir-av', checked: dirState.available });
    const modeSel = h('select', { id: 'dir-mode' },
      h('option', { value: '' }, 'All'), h('option', { value: 'webhook' }, 'API (webhook)'), h('option', { value: 'queue' }, 'Human (queue)'));
    modeSel.value = dirState.mode;
    const controls = h('form', { class: 'controls', role: 'search', onsubmit: (e) => { e.preventDefault(); load(false); } },
      h('div', { class: 'field grow' }, h('label', { for: 'dir-q' }, 'Search'), qIn),
      sf ? null : h('div', { class: 'field' }, h('label', { for: 'dir-mode' }, 'Mode'), modeSel),
      h('div', { class: 'field' }, h('label', { class: 'inline', for: 'dir-av' }, avIn, T('availableNow') + ' only')));
    const chips = sf ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Media type' }) : null;
    if (chips) {
      add(chips, MEDIA_CHIPS.map(([v, l]) => {
        const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(dirState.media === v), 'data-v': v }, l);
        b.addEventListener('click', () => {
          dirState.media = v;
          chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === v)));
          renderList(lastItems);
        });
        return b;
      }));
    }
    const info = h('span', { 'aria-live': 'polite' });
    const refreshNote = h('span');
    const errSlot = h('div');
    const list = h('ul', { class: 'svc-list', 'aria-label': T('services') });
    add(main, intro, controls, chips, h('div', { class: 'listmeta' }, info, refreshNote), errSlot, list);

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
      if (sf) { p.set('media', '1'); p.set('mode', 'queue'); } else if (dirState.mode) p.set('mode', dirState.mode);
      p.set('limit', '100');
      try {
        const { data } = await api('GET', '/v1/services?' + p.toString(), undefined, { signal: c.signal });
        const items = data && Array.isArray(data.services) ? data.services.filter(isObj) : [];
        lastItems = items;
        renderList(items);
        if (sf) renderCounts();
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
      const shown = sf && dirState.media ? items.filter((s) => Array.isArray(s.media) && s.media.includes(dirState.media)) : items;
      list.replaceChildren(...shown.map(svcRow));
      if (!shown.length) list.appendChild(emptyState());
      const label = T('services').toLowerCase();
      const txt = shown.length + ' ' + (shown.length === 1 ? T('service') : label);
      if (info.textContent !== txt) info.textContent = txt;
      if (focusSlug) {
        const el = Array.from(list.querySelectorAll('a[data-slug]')).find((a) => a.dataset.slug === focusSlug);
        if (el) el.focus({ preventScroll: true });
      }
      window.scrollTo(0, y);
    }

    function emptyState() {
      const filtered = dirState.q || dirState.available || (!sf && dirState.mode) || (sf && dirState.media);
      const noun = T('services').toLowerCase();
      return h('li', { class: 'empty' }, filtered
        ? [h('p', null, 'No ' + noun + ' match these filters' + (dirState.available ? ' right now' : '') + '.'),
          h('button', { type: 'button', class: 'btn', onclick: () => {
            dirState.q = ''; dirState.available = false; dirState.mode = ''; dirState.media = '';
            qIn.value = ''; avIn.checked = false; modeSel.value = '';
            if (chips) chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === '')));
            load(false);
          } }, 'Clear filters')]
        : [h('p', null, 'No ' + noun + ' are listed yet.'), h('a', { class: 'btn btn-primary', href: '#/publish' }, sf ? 'Offer your work' : 'Publish the first one')]);
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
      if (!sf) loadMeta(true).then(() => { if (!ctx.signal.aborted) renderCounts(); });
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
        stat('Price', h('span', { class: 'price' }, fmtPrice(num(s.price_cents) == null ? 0 : s.price_cents)), 'Per call'),
        stat('Rating', fmtRating(st.rating, st.reviews), 'Average of verified reviews (count)'),
        stat(SF() ? 'Turnaround' : 'Median', fmtMs(st.p50_ms), 'Median response time'),
        SF() ? stat('Queue', fmtNum(st.pending), 'Commissions waiting') : stat('Uptime 7d', fmtPct(st.uptime_7d)),
        stat(SF() ? 'Done' : 'Calls', fmtNum(st.calls)),
        s.mode === 'queue' && !SF() ? stat('Pending', fmtNum(st.pending), 'Tasks waiting for a worker') : h('div')));
  }

  /* =========================================================================
   * Detail  #/s/:slug
   * ======================================================================= */
  function curlFor(s) {
    let body;
    const b = { input: s.example_input !== undefined && s.example_input !== null ? s.example_input : {} };
    if (num(s.price_cents) > 0) b.max_price_cents = s.price_cents;
    try { body = JSON.stringify(b); } catch { body = '{"input":{}}'; }
    const q = body.replace(/'/g, `'\\''`);
    return [
      ...(s.mode === 'queue' ? [
        '# People answer this; it can take up to ' + fmtMs(s.timeout_ms) + '. Add "callback_url":"https://your.host/hook"',
        '# to the body to receive a POST of the call object when it finishes, or poll GET /v1/calls/CALL_ID?wait_ms=25000',
      ] : []),
      ...(num(s.price_cents) > 0 ? ['# Paid: ' + fmtUsd(s.price_cents) + ' per call, charged to your balance; max_price_cents must be >= the price.'] : []),
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
      h('nav', { class: 'crumb', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/' }, '← ' + T('directory'))),
      h('div', { class: 'dhead' }, h('h1', null, s.name || s.slug), statusTag(s, true), modeBadge(s.mode)),
      h('p', { class: 'muted small mono' }, s.slug + ' · by ' + (s.owner || '?') + ' · listed ' + fmtAgo(s.created_at)),
      tagList(s.tags),
      s.description ? h('p', { class: 'desc', style: 'margin-top:8px' }, s.description) : null,
      s.status === 'suspended' ? h('div', { class: 'alert alert-error', role: 'alert' }, h('b', null, 'Suspended by moderators. '), 'This listing cannot be called' + (isOwner(s) ? '. Contact the operators if you think this is a mistake.' : '.')) : null);

    if (isOwner(s)) main.appendChild(ownerBar(ctx, s));
    else if (isWorkerOn(s) && s.mode === 'queue') {
      main.appendChild(h('section', { class: 'panel owner-bar', style: 'margin-top:12px' }, h('div', { class: 'row' },
        h('b', null, 'You are a worker on this listing.'), h('a', { class: 'btn btn-primary', href: '#/work/' + enc(s.slug) }, 'Open worker console'))));
    }

    add(main, h('dl', { class: 'statgrid', style: 'margin-top:12px' },
      stat('Status', statusLabel(statusOf(s))),
      stat('Price', fmtPrice(num(s.price_cents) == null ? 0 : s.price_cents)),
      stat('Rating', fmtRating(st.rating, st.reviews)),
      stat('Calls', fmtNum(st.calls)),
      stat('Success', fmtPct(st.success_rate)),
      stat('Median (p50)', fmtMs(st.p50_ms)),
      stat('p95', fmtMs(st.p95_ms)),
      stat('Uptime 7d', fmtPct(st.uptime_7d)),
      s.mode === 'queue' ? stat('Pending', fmtNum(st.pending)) : stat('Last check', fmtAgo(st.last_checked_at)),
      s.mode === 'queue' ? stat('Workers online', fmtNum(st.workers_online)) : null,
      stat(s.mode === 'queue' ? 'Time allowed' : 'Timeout', fmtMs(s.timeout_ms))));

    const schemaGrid = h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', null, 'Input schema'), h('p', null, h('code', { class: 'io' }, s.input_summary || '—')), codeBlock(pretty(s.input_schema), 'Input schema')),
      h('section', { class: 'panel' }, h('h2', null, 'Output schema'), h('p', null, h('code', { class: 'io' }, s.output_summary || '—')), codeBlock(pretty(s.output_schema), 'Output schema')));
    // People on the storefront rarely need raw schemas; keep them one click away.
    add(main, SF() ? h('details', { class: 'panel' }, h('summary', null, 'Technical details: input and output schemas'), schemaGrid) : schemaGrid);

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
      h('section', { class: 'panel' }, h('h2', null, 'Call it over HTTP'), h('p', { class: 'muted small' }, 'Set API_KEY to your key from Account.'), codeBlock(curlFor(s), 'curl example'),
        h('h2', { style: 'margin-top:12px' }, 'Reviews (' + fmtNum(st.reviews || reviews.length) + ')'), reviewsList),
      tryPanel(ctx, s, reloadReviews)));
    if (S.me && !isOwner(s)) main.appendChild(reportControl(ctx, s));
  }

  function ownerBar(ctx, s) {
    const err = h('div');
    const paused = s.status === 'paused';
    const toggle = h('button', { type: 'button', class: 'btn', disabled: s.status === 'suspended' }, paused ? 'Resume' : 'Pause');
    const priceIn = h('input', { type: 'number', id: 'o-price', min: 0, max: 1000, step: '0.01', inputmode: 'decimal', style: 'width:110px',
      value: ((num(s.price_cents) || 0) / 100).toFixed(2) });
    const priceBtn = h('button', { type: 'button', class: 'btn btn-sm' }, 'Save price');
    priceBtn.addEventListener('click', async () => {
      err.replaceChildren();
      const c = dollarsToCents(priceIn.value);
      if (c == null || c > 100000) { err.appendChild(errorBox({ message: 'Price must be between $0 and $1000.' })); return; }
      priceBtn.disabled = true;
      try {
        await api('PATCH', '/v1/services/' + enc(s.slug), { price_cents: c }, { signal: ctx.signal });
        route();
      } catch (e) { if (!isAbort(e)) { err.appendChild(errorBox(e)); priceBtn.disabled = false; } }
    });
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
      h('div', { class: 'row', style: 'margin-top:8px' }, h('label', { class: 'inline', for: 'o-price' }, 'Price (USD)'), priceIn, priceBtn,
        h('span', { class: 'muted small' }, '0 = free' + (num(S.meta && S.meta.fee_percent) != null ? '; platform fee ' + S.meta.fee_percent + '%' : ''))),
      err,
      s.mode === 'queue' ? workersPanel(ctx, s) : null);
  }

  function workersPanel(ctx, s) {
    const base = '/v1/services/' + enc(s.slug) + '/workers';
    const list = h('ul', { class: 'plain' });
    const err = h('div');
    const inp = h('input', { type: 'text', id: 'w-add', placeholder: 'handle', autocomplete: 'off', spellcheck: 'false', style: 'max-width:220px' });
    async function load() {
      try {
        const r = await api('GET', base, undefined, { signal: ctx.signal });
        const ws = r.data && Array.isArray(r.data.workers) ? r.data.workers.filter(isObj) : [];
        fill(list, ws.length ? ws.map((w) => {
          const rm = h('button', { type: 'button', class: 'btn btn-sm' }, 'Remove');
          rm.addEventListener('click', async () => {
            if (!window.confirm('Remove @' + w.handle + ' from this inbox?')) return;
            rm.disabled = true;
            try { await api('DELETE', base + '/' + enc(w.handle), undefined, { signal: ctx.signal }); load(); }
            catch (e) { if (!isAbort(e)) { fill(err, errorBox(e)); rm.disabled = false; } }
          });
          const st = w.online ? 'available' : 'offline';
          return h('li', { class: 'row' },
            h('span', { class: 'status status-' + st }, h('span', { class: 'dot', 'aria-hidden': 'true' }), w.online ? 'Online' : 'Offline'),
            h('b', null, '@' + w.handle),
            h('span', { class: 'muted small' }, w.last_seen_at ? 'seen ' + fmtAgo(w.last_seen_at) : 'not seen yet'),
            h('span', { class: 'spacer' }), rm);
        }) : h('li', { class: 'muted' }, 'No added workers. Only you can answer tasks.'));
      } catch (e) { if (!isAbort(e)) fill(err, errorBox(e, 'Could not load workers')); }
    }
    const form = h('form', { class: 'row', style: 'margin-top:6px', novalidate: true }, h('label', { class: 'inline', for: 'w-add' }, 'Add worker'), inp,
      h('button', { type: 'submit', class: 'btn btn-sm' }, 'Add'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.replaceChildren();
      const v = inp.value.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_-]{3,32}$/.test(v)) { err.appendChild(errorBox({ message: 'Enter a valid handle.' })); return; }
      try { await api('POST', base, { handle: v }, { signal: ctx.signal }); inp.value = ''; load(); }
      catch (ex) { if (!isAbort(ex)) err.appendChild(errorBox(ex)); }
    });
    load();
    return h('div', { style: 'margin-top:12px' }, h('h3', null, 'Workers'),
      h('p', { class: 'muted small' }, 'People you add can open the worker console for this listing and answer tasks. Payment for answered tasks goes to you, the owner.'),
      list, form, err);
  }

  function reportControl(ctx, s) {
    const wrap = h('div', { class: 'report' });
    const open = h('button', { type: 'button', class: 'linkbtn' }, 'Report this listing');
    const sel = h('select', { id: 'rp-reason' }, ['spam', 'harmful', 'fraud', 'broken', 'other'].map((r) => h('option', { value: r }, r)));
    const detail = h('textarea', { id: 'rp-detail', rows: 2, maxlength: 2000, class: 'prose' });
    const err = h('div');
    const cancel = h('button', { type: 'button', class: 'btn btn-sm' }, 'Cancel');
    const form = h('form', { class: 'panel', style: 'max-width:460px' },
      h('div', { class: 'field' }, h('label', { for: 'rp-reason' }, 'Reason'), sel),
      h('div', { class: 'field' }, h('label', { for: 'rp-detail' }, 'Details (optional)'), detail),
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-sm btn-danger' }, 'Send report'), cancel), err);
    open.addEventListener('click', () => { open.hidden = true; wrap.appendChild(form); sel.focus(); });
    cancel.addEventListener('click', () => { form.remove(); open.hidden = false; open.focus(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.replaceChildren();
      const body = { reason: sel.value };
      if (detail.value.trim()) body.detail = detail.value.trim();
      try {
        await api('POST', '/v1/services/' + enc(s.slug) + '/report', body, { signal: ctx.signal });
        fill(wrap, h('p', { class: 'muted small' }, 'Reported. Moderators will review it.'));
      } catch (ex) {
        if (isAbort(ex)) return;
        if (ex.code === 'already_reported') fill(wrap, h('p', { class: 'muted small' }, 'You have already reported this listing.'));
        else err.appendChild(errorBox(ex));
      }
    });
    wrap.appendChild(open);
    return wrap;
  }

  const FINISHED = ['done', 'failed', 'timeout'];

  // Long-polls GET /v1/calls/:id until the call leaves pending/claimed. Returns the final call.
  async function waitForCall(call, sig, onUpdate, onRetry) {
    let backoff = 1000;
    while (call.status === 'pending' || call.status === 'claimed') {
      try {
        const g = await api('GET', '/v1/calls/' + enc(call.call_id) + '?wait_ms=25000', undefined, { signal: sig });
        if (isObj(g.data) && g.data.status) call = Object.assign({}, call, g.data);
        backoff = 1000;
        if (onUpdate) onUpdate(call);
      } catch (e) {
        if (isAbort(e) || (e.status && e.status < 500)) throw e;
        if (onRetry) onRetry(e, backoff);
        await sleep(backoff, sig);
        backoff = Math.min(backoff * 2, 30000);
      }
    }
    return call;
  }

  function pendingText(st) {
    return st === 'claimed' ? 'claimed — ' + T('worker') + (SF() ? ' is working on it' : ' is answering') : 'pending — waiting for ' + T('worker');
  }

  // Output (rendered by media type) or error, plus the review form when eligible.
  function callResult(ctx, c, schema, onReviewed, canReview) {
    const box = h('div');
    if (c.status === 'done') {
      add(box, h('h3', null, 'Output'), h('div', { class: 'inputview' }, renderValue('output', c.output, 0, schema)),
        h('details', null, h('summary', { class: 'small' }, 'Raw JSON'), codeBlock(pretty(c.output), 'Output')));
    } else if (FINISHED.includes(c.status)) {
      const er = c.error;
      const msg = isObj(er) ? (er.message || er.code || pretty(er)) : er ? String(er) : c.status === 'timeout' ? 'No answer before the time allowed ran out.' : 'The call did not complete.';
      box.appendChild(errorBox({ message: msg, details: isObj(er) ? er.details : undefined }, c.status === 'timeout' ? 'Timed out' : 'Failed'));
      if (num(c.price_cents) > 0) box.appendChild(h('p', { class: 'muted small' }, fmtUsd(c.price_cents) + ' was refunded to your balance automatically.'));
    }
    if (canReview !== false && c.call_id && !c.reviewed && FINISHED.includes(c.status)) box.appendChild(reviewForm(ctx, c.call_id, onReviewed));
    return box;
  }

  function callLink(id, s) {
    const href = '#/call/' + enc(id);
    return h('div', { class: 'alert alert-ok' }, 'Call ', h('code', null, String(id)), ' is queued',
      s && s.mode === 'queue' ? ' (time allowed: ' + fmtMs(s.timeout_ms) + ')' : '', '. Permanent link: ',
      h('a', { href }, location.origin + location.pathname + location.search + href),
      h('div', { class: 'small muted' }, 'Bookmark it; you can close this page and check back later. It is also listed under Account → My recent calls.'));
  }

  function tryPanel(ctx, s, onReviewed) {
    const sf = !!SF();
    const price = num(s.price_cents) || 0;
    const blocked = s.status === 'suspended';
    // Input editor: generated form (default on storefront) or raw JSON (default on the marketplace).
    const gen = buildAnswerForm(s.input_schema, ctx.signal, 'input (JSON)');
    const ta = h('textarea', { id: 'try-input', rows: 8, spellcheck: 'false' });
    const ex = s.example_input !== undefined && s.example_input !== null ? s.example_input : skeleton(s.input_schema);
    ta.value = pretty(ex == null ? {} : ex);
    const hint = h('div', { class: 'hint', 'aria-live': 'polite' });
    const validate = () => {
      try { JSON.parse(ta.value); hint.className = 'hint good'; hint.textContent = 'Valid JSON'; ta.removeAttribute('aria-invalid'); return true; }
      catch (e) { hint.className = 'hint bad'; hint.textContent = 'Invalid JSON: ' + e.message; ta.setAttribute('aria-invalid', 'true'); return false; }
    };
    ta.addEventListener('input', validate);
    const formBox = h('div', null, gen.el);
    const jsonBox = h('div', { class: 'field' }, h('label', { for: 'try-input' }, 'input (JSON)'), ta, hint);
    let useJson = !sf || !gen.flat;
    const toggleBtn = h('button', { type: 'button', class: 'linkbtn', hidden: !gen.flat });
    const syncEditor = () => { formBox.hidden = useJson; jsonBox.hidden = !useJson; toggleBtn.textContent = useJson ? 'Use the form' : 'Edit as JSON'; };
    toggleBtn.addEventListener('click', () => {
      if (!useJson) { const r = gen.read(); if (r.ok) ta.value = pretty(r.value); validate(); }
      useJson = !useJson; syncEditor();
    });
    syncEditor();
    const getInput = () => (useJson
      ? (validate() ? { ok: true, value: JSON.parse(ta.value) } : { ok: false, errors: ['input is not valid JSON'] })
      : gen.read());

    const qOff = s.mode === 'queue' ? h('input', { type: 'checkbox', id: 'try-qoff', checked: sf }) : null;
    const cbIn = s.mode === 'queue' ? h('input', { type: 'url', id: 'try-cb', placeholder: 'https://your.host/hook', autocomplete: 'off' }) : null;
    const confirmCb = price > 0 ? h('input', { type: 'checkbox', id: 'try-confirm' }) : null;
    const btn = h('button', { type: 'submit', class: 'btn btn-primary', disabled: blocked }, T('call'));
    const stopBtn = h('button', { type: 'button', class: 'btn', hidden: true }, 'Stop waiting');
    const out = h('div');
    let pollCtrl = null;
    stopBtn.addEventListener('click', () => { if (pollCtrl) pollCtrl.abort(); });

    const form = h('form', { class: 'panel', 'aria-labelledby': 'try-h', novalidate: true },
      h('div', { class: 'row' }, h('h2', { id: 'try-h', style: 'margin:0' }, T('tryIt')), h('span', { class: 'spacer' }),
        h('span', { class: 'price' }, price > 0 ? fmtUsd(price) + (sf ? ' per commission' : ' per call') : 'Free')),
      getKey() ? null : h('div', { class: 'alert alert-warn' }, (sf ? 'Commissioning' : 'Calling') + ' requires an account. ', h('a', { href: '#/account' }, 'Create one or sign in'), '.'),
      h('div', { style: 'margin-top:8px' }, formBox, jsonBox, h('p', { class: 'small' }, toggleBtn)),
      qOff ? h('div', { class: 'field' }, h('label', { class: 'inline', for: 'try-qoff' }, qOff,
        sf ? 'Send even if the artist is not online right now (they will see it in their inbox)' : 'Queue the task even if no worker is online')) : null,
      cbIn ? h('details', { class: 'field' }, h('summary', { class: 'small' }, 'Notify a URL when finished (callback_url)'),
        h('label', { for: 'try-cb', class: 'sr-only' }, 'callback_url'), cbIn,
        h('div', { class: 'hint' }, 'Receives a POST of the call object when it finishes. https only.')) : null,
      confirmCb ? h('div', { class: 'field' }, h('label', { class: 'inline', for: 'try-confirm' }, confirmCb,
        'Spend ' + fmtUsd(price) + ' from my balance' + (S.me && num(S.me.balance_cents) != null ? ' (balance ' + fmtUsd(S.me.balance_cents) + ')' : '')),
        h('div', { class: 'hint' }, 'Refunded automatically if the call fails or times out.')) : null,
      h('div', { class: 'row' }, btn, stopBtn),
      out);

    form.addEventListener('submit', (e) => { e.preventDefault(); run().catch(() => {}); });

    async function run() {
      const inp = getInput();
      if (!inp.ok) { fill(out, errorBox({ message: 'Incomplete input.', details: inp.errors })); return; }
      if (confirmCb && !confirmCb.checked) { fill(out, errorBox({ message: 'Tick "Spend ' + fmtUsd(price) + ' from my balance" to confirm.' })); confirmCb.focus(); return; }
      const cb = cbIn ? cbIn.value.trim() : '';
      if (cb && !safeUrl(cb)) { fill(out, errorBox({ message: 'callback_url must be an https URL.' })); return; }
      if (pollCtrl) pollCtrl.abort();
      pollCtrl = linked(ctx.signal);
      const sig = pollCtrl.signal;
      const line = h('p', { class: 'callstatus mono', 'aria-live': 'polite' }, sf ? 'Sending…' : 'Calling…');
      fill(out, line);
      btn.disabled = true;
      const t0 = Date.now();
      let call = null, tick = null;
      try {
        // Short first wait for queue work so the permanent link shows quickly; webhooks answer within it anyway.
        const body = { input: inp.value, wait_ms: s.mode === 'queue' ? 3000 : 20000 };
        if (price > 0) body.max_price_cents = price;
        if (qOff && qOff.checked) body.queue_if_offline = true;
        if (cb) body.callback_url = cb;
        const r = await api('POST', '/v1/services/' + enc(s.slug) + '/call', body, { signal: sig, ok: [502] });
        call = isObj(r.data) ? r.data : {};
        if (price > 0) loadMe(true);
        if (call.status === 'pending' || call.status === 'claimed') {
          if (call.call_id) out.appendChild(callLink(call.call_id, s));
          stopBtn.hidden = false;
          const show = () => { line.textContent = pendingText(call.status) + ' · ' + fmtMs(Date.now() - t0) + ' elapsed'; };
          show();
          tick = setInterval(show, 1000);
          call = await waitForCall(call, sig, (c) => { call = c; show(); },
            (e, b) => { line.textContent = 'connection problem, retrying in ' + fmtMs(b); });
        }
        const lat = num(call.latency_ms) != null ? call.latency_ms : Date.now() - t0;
        line.textContent = (call.status || 'unknown') + ' · ' + fmtMs(lat) + (call.call_id ? ' · call ' + call.call_id : '');
        out.appendChild(callResult(ctx, call, s.output_schema, onReviewed));
        if (price > 0 && call.status !== 'done') loadMe(true);
      } catch (e) {
        if (isAbort(e)) {
          if (!ctx.signal.aborted) line.textContent = call && call.call_id ? 'Stopped waiting. The call continues; use the link above to check it later.' : 'Stopped.';
          return;
        }
        line.textContent = '';
        out.appendChild(errorBox(e, e.code === 'service_unavailable' ? 'Unavailable' : e.status === 402 ? 'Payment' : 'Call failed'));
        if (e.code === 'insufficient_funds') out.appendChild(h('p', null, h('a', { class: 'btn btn-primary', href: '#/billing' }, 'Add funds')));
        if (e.code === 'price_not_accepted') out.appendChild(h('p', { class: 'muted small' }, 'The price may have changed. ', h('button', { type: 'button', class: 'linkbtn', onclick: () => route() }, 'Reload'), ' to see the current price.'));
        if (e.code === 'service_unavailable' && qOff) out.appendChild(h('p', { class: 'muted small' }, 'Nobody is online. Tick the box above to leave it in the inbox.'));
      } finally {
        if (tick) clearInterval(tick);
        btn.disabled = blocked; stopBtn.hidden = true;
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
      creative: true,
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
      creative: true,
    },
    video: {
      label: 'Human-made video (queue, 7 d)',
      name: 'Short custom video',
      description: 'A person shoots or animates a short original video from your brief and returns a link to the file. Allow up to 7 days.',
      tags: 'video, animation, human',
      mode: 'queue',
      input_schema: { type: 'object', properties: {
        brief: { type: 'string', minLength: 1, maxLength: 4000, description: 'What the video should show and where it will be used' },
        duration_seconds: { type: 'integer', minimum: 5, maximum: 300 },
      }, required: ['brief'], additionalProperties: false },
      output_schema: { type: 'object', properties: {
        video_url: { type: 'string', format: 'uri', contentMediaType: 'video/*', description: 'The finished video' },
        note: { type: 'string', maxLength: 2000 },
      }, required: ['video_url'], additionalProperties: false },
      example_input: { brief: 'A 10-second looping animation of rain on a window for a website header', duration_seconds: 10 },
      timeout_ms: 7 * 86400000,
      creative: true,
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
    const sf = SF();
    setTitle(T('publish'));
    await loadMe();
    if (ctx.signal.aborted) return;
    const fee = num(S.meta && S.meta.fee_percent);
    const f = {
      price: h('input', { type: 'number', id: 'p-price', min: 0, max: 1000, step: '0.01', inputmode: 'decimal', value: '0.00', 'aria-describedby': 'p-price-hint' }),
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
      h('input', { type: 'radio', name: 'p-mode', value: val, checked: val === (sf ? 'queue' : 'webhook') }),
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
    const mode = () => { const r = form.querySelector('input[name="p-mode"]:checked'); return r ? r.value : (sf ? 'queue' : 'webhook'); };
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
        Object.values(TEMPLATES).filter((t) => !sf || t.creative).map((t) => h('button', { type: 'button', class: 'btn btn-sm', onclick: () => applyTemplate(t) }, t.label))),
      h('div', { class: 'field' }, h('label', { for: 'p-name' }, 'Name'), f.name),
      h('div', { class: 'field' }, h('label', { for: 'p-desc' }, 'Description'), f.description,
        h('div', { class: 'hint' }, 'What it does, what quality to expect, any limits. Agents read this to decide.')),
      h('div', { class: 'field' }, h('label', { for: 'p-tags' }, 'Tags (comma-separated)'), f.tags),
      h('div', { class: 'field' }, h('label', { for: 'p-price' }, sf ? 'Price per commission (USD)' : 'Price per call (USD)'), f.price,
        h('div', { class: 'hint', id: 'p-price-hint' }, '0 = free. Callers pay from their balance; failed or timed-out calls are refunded. ' +
          'The platform fee is ' + (fee != null ? fee + '%' : 'a percentage') + ' of each paid call; the rest is credited to you as earnings.')),
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

    add(main, h('h1', null, sf ? 'Offer your work' : 'Publish a service'),
      sf ? h('p', { class: 'muted' }, 'Create a listing people and agents can commission. You answer each commission in the worker console, usually by uploading the finished file.') : null,
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
      const priceCents = dollarsToCents(f.price.value);
      if (priceCents == null || priceCents > 100000) problems.push('price must be between $0 and $1000');
      if (problems.length) { err.appendChild(errorBox({ message: 'Fix these fields.', details: problems })); return; }
      const body = {
        name, description: f.description.value.trim(),
        tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
        mode: m, input_schema: a.value, output_schema: b.value, price_cents: priceCents,
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
  function buildAnswerForm(schema, signal, jsonLabel) {
    if (isFlat(schema)) {
      const req = Array.isArray(schema.required) ? schema.required : [];
      const fields = Object.keys(schema.properties).map((k) => buildField(k, schema.properties[k], req.includes(k), signal));
      const withKeys = fields.find((f) => f.keys && Object.keys(f.keys).length);
      return {
        flat: true,
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
      flat: false,
      el: h('div', { class: 'field' }, h('label', { for: id }, jsonLabel || 'Output (JSON matching the output schema)'), ta,
        h('details', null, h('summary', { class: 'small' }, 'Schema'), h('pre', { class: 'small' }, pretty(schema)))),
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

    const stateLine = h('div', { class: 'state', 'aria-live': 'polite' });
    const toggle = h('button', { type: 'button', class: 'btn btn-primary btn-big' }, 'Go online');
    const counter = h('span', { class: 'muted small mono' });
    const presence = h('section', { class: 'panel presence' }, stateLine, h('div', null, toggle, h('div', null, counter)));
    const taskSlot = h('div');
    add(main,
      s.status === 'paused' ? h('div', { class: 'alert alert-warn' }, 'This service is paused; agents cannot call it. Resume it on the ', h('a', { href: '#/s/' + enc(slug) }, 'detail page'), '.') : null,
      s.status === 'suspended' ? h('div', { class: 'alert alert-error' }, h('b', null, 'Suspended by moderators. '), 'No new tasks will arrive.') : null,
      S.me && !isOwner(s) ? h('p', { class: 'muted small' }, 'Working as @' + S.me.handle + ' for @' + s.owner + '.') : null,
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
    await loadMe(true);
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
    const works = Array.isArray(me.works_for) ? me.works_for.filter(isObj) : [];
    const miniList = (items) => h('ul', { class: 'svc-list', style: 'margin-top:8px' }, items.map((s) => h('li', { class: 'svc st-' + statusOf(s) },
      h('div', null, statusTag(s)),
      h('div', null,
        h('div', { class: 'svc-head' }, h('a', { class: 'svc-name', href: '#/s/' + enc(s.slug) }, s.name || s.slug), modeBadge(s.mode),
          h('span', { class: 'price small' }, fmtPrice(num(s.price_cents) == null ? 0 : s.price_cents))),
        ioLine(s)),
      h('div', null, s.mode === 'queue' ? h('a', { class: 'btn btn-sm', href: '#/work/' + enc(s.slug) }, 'Worker console') : null))));
    const callsBox = h('div', null, h('p', { class: 'muted' }, 'Loading…'));
    add(main,
      h('section', { class: 'panel' },
        h('dl', { class: 'kv' },
          h('dt', null, 'Handle'), h('dd', null, h('b', null, '@' + me.handle), me.is_admin ? [' ', h('a', { class: 'badge', href: '#/admin' }, 'admin')] : null),
          h('dt', null, 'Balance'), h('dd', null, h('b', { class: 'mono' }, fmtUsd(me.balance_cents)), ' ', h('a', { href: '#/billing' }, 'Billing')),
          h('dt', null, 'Earned'), h('dd', { class: 'mono' }, fmtUsd(me.earned_cents)),
          h('dt', null, 'API key'), h('dd', null, keyEl, ' ', reveal, ' ', copyBtn(() => key))),
        h('div', { class: 'row', style: 'margin-top:10px' }, out)),
      h('section', { class: 'panel' },
        h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'My services'), h('span', { class: 'spacer' }), h('a', { class: 'btn btn-sm btn-primary', href: '#/publish' }, T('publish'))),
        svcs.length ? miniList(svcs) : h('p', { class: 'muted', style: 'margin-top:8px' }, 'You have not published any services yet.')),
      works.length ? h('section', { class: 'panel' }, h('h2', { style: 'margin:0' }, 'Inboxes I work'), miniList(works)) : null,
      h('section', { class: 'panel' }, h('h2', null, 'My recent calls'), callsBox));
    api('GET', '/v1/calls', undefined, { signal: ctx.signal }).then((r) => {
      const cs = r.data && Array.isArray(r.data.calls) ? r.data.calls.filter(isObj) : [];
      fill(callsBox, cs.length ? callsTable(cs) : h('p', { class: 'muted' }, 'No calls yet.'));
    }, (e) => { if (!isAbort(e)) fill(callsBox, errorBox(e, 'Could not load calls')); });
  }

  function svcSlugOf(v) { return typeof v === 'string' ? v : isObj(v) && typeof v.slug === 'string' ? v.slug : null; }
  function callsTable(cs) {
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Call'), h('th', null, 'Service'), h('th', null, 'Status'), h('th', { class: 'num' }, 'Price'), h('th', { class: 'num' }, 'Created'))),
      h('tbody', null, cs.map((c) => {
        const slug = svcSlugOf(c.service);
        return h('tr', null,
          h('td', null, h('a', { class: 'mono', href: '#/call/' + enc(c.call_id) }, String(c.call_id))),
          h('td', null, slug ? h('a', { href: '#/s/' + enc(slug) }, slug) : '—'),
          h('td', { class: 'mono' }, String(c.status || '?')),
          h('td', { class: 'num' }, fmtPrice(c.price_cents)),
          h('td', { class: 'num' }, fmtAgo(c.created_at)));
      }))));
  }

  /* =========================================================================
   * Call  #/call/:id
   * ======================================================================= */
  async function viewCall(ctx, id) {
    setTitle('Call ' + id);
    await loadMe();
    if (ctx.signal.aborted) return;
    add(main, h('nav', { class: 'crumb', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/account' }, '← Account')));
    if (!getKey()) { add(main, errorBox({ status: 401, message: 'Sign in to view this call.' })); return; }
    const r = await api('GET', '/v1/calls/' + enc(id), undefined, { signal: ctx.signal });
    let call = isObj(r.data) ? r.data : {};
    const slug = svcSlugOf(call.service);
    let svc = null;
    if (slug) {
      try {
        const sr = await api('GET', '/v1/services/' + enc(slug), undefined, { signal: ctx.signal });
        svc = sr.data && isObj(sr.data.service) ? sr.data.service : null;
      } catch (e) { if (isAbort(e)) throw e; }
    }
    if (ctx.signal.aborted) return;
    if (svc) setTitle('Call · ' + (svc.name || slug));
    const statusEl = h('p', { class: 'callstatus mono', 'aria-live': 'polite' });
    const facts = h('dl', { class: 'statgrid' });
    const resultBox = h('div');
    add(main, h('h1', null, 'Call ', h('code', null, String(call.call_id || id))),
      h('p', null, slug ? h('a', { href: '#/s/' + enc(slug) }, svc ? svc.name || slug : slug) : null, svc ? [' · by @', svc.owner] : null),
      statusEl, facts,
      h('div', { class: 'grid2' },
        h('section', { class: 'panel inputview' }, h('h2', null, 'Input'), renderValue('input', call.input, 0, svc && svc.input_schema)),
        h('section', { class: 'panel' }, resultBox)));

    const stat = (label, value) => h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value));
    let tick = null;
    function render() {
      const pend = call.status === 'pending' || call.status === 'claimed';
      statusEl.textContent = pend
        ? pendingText(call.status) + ' · created ' + fmtAgo(call.created_at) + ' · this page updates automatically'
        : String(call.status || 'unknown');
      fill(facts,
        stat('Status', String(call.status || '?')),
        stat('Price', fmtPrice(call.price_cents)),
        stat('Created', fmtAgo(call.created_at)),
        stat('Latency', fmtMs(call.latency_ms)),
        svc && svc.mode === 'queue' && num(call.created_at) != null && num(svc.timeout_ms) != null && pend
          ? stat('Deadline', fmtClock(call.created_at + svc.timeout_ms - Date.now()) + ' left') : null);
      fill(resultBox, pend ? h('p', { class: 'muted' }, 'No result yet.')
        : callResult(ctx, call, svc && svc.output_schema, null, !(svc && isOwner(svc))));
    }
    render();
    if (call.status === 'pending' || call.status === 'claimed') {
      tick = setInterval(() => { if (call.status === 'pending' || call.status === 'claimed') render(); }, 30000);
      ctx.onLeave(() => clearInterval(tick));
      try {
        call = await waitForCall(call, ctx.signal, (c) => { call = c; render(); },
          (e, b) => { statusEl.textContent = 'connection problem, retrying in ' + fmtMs(b); });
      } finally { clearInterval(tick); }
      render();
    }
  }

  /* =========================================================================
   * Billing  #/billing
   * ======================================================================= */
  const LEDGER_KIND = { topup: 'Top-up', hold: 'Call charge', refund: 'Refund', earning: 'Earning', fee: 'Platform fee', payout: 'Payout', grant: 'Credit grant' };

  async function viewBilling(ctx) {
    setTitle('Billing');
    await loadMe();
    if (ctx.signal.aborted) return;
    add(main, h('h1', null, 'Billing'));
    if (!getKey()) { add(main, errorBox({ status: 401, message: 'Sign in to see your balance.' })); return; }
    const paid = ctx.query.get('paid') === '1';
    if (paid) add(main, okBox('Payment received. Your balance updates within a few seconds.'));
    const summary = h('section', { class: 'panel' });
    const topup = h('section', { class: 'panel' });
    const payout = h('section', { class: 'panel' });
    const ledger = h('section', { class: 'panel' });
    add(main, summary, h('div', { class: 'grid2' }, topup, payout), ledger);
    let data = {};

    async function load() {
      const r = await api('GET', '/v1/billing', undefined, { signal: ctx.signal });
      data = isObj(r.data) ? r.data : {};
      renderSummary(); renderLedger();
    }
    function renderSummary() {
      fill(summary, h('dl', { class: 'kv' },
        h('dt', null, 'Balance'), h('dd', null, h('span', { class: 'bigmoney mono' }, fmtUsd(data.balance_cents))),
        h('dt', null, 'Earned (all time)'), h('dd', { class: 'mono' }, fmtUsd(S.me && S.me.earned_cents)),
        h('dt', null, 'Platform fee'), h('dd', null, num(data.fee_percent) != null ? data.fee_percent + '% of each paid call' : '—')),
        h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Paid calls are held from your balance when made and refunded automatically if they fail or time out.'));
    }
    function renderLedger() {
      const rows = Array.isArray(data.ledger) ? data.ledger.filter(isObj) : [];
      fill(ledger, h('h2', null, 'Ledger'), rows.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'Kind'), h('th', { class: 'num' }, 'Amount'), h('th', null, 'Call'), h('th', null, 'Note'))),
        h('tbody', null, rows.map((e) => h('tr', null,
          h('td', { title: num(e.at) != null ? new Date(e.at).toISOString() : null }, fmtAgo(e.at)),
          h('td', null, LEDGER_KIND[e.kind] || String(e.kind || '?')),
          h('td', { class: 'num ' + (num(e.amount_cents) > 0 ? 'pos' : '') }, (num(e.amount_cents) > 0 ? '+' : '') + fmtUsd(e.amount_cents)),
          h('td', null, e.call_id ? h('a', { class: 'mono', href: '#/call/' + enc(e.call_id) }, String(e.call_id)) : ''),
          h('td', { class: 'small' }, e.note ? String(e.note) : '')))))) : h('p', { class: 'muted' }, 'No transactions yet.'));
    }

    function renderTopup() {
      if (!data.payments_enabled) { fill(topup, h('h2', null, 'Add funds'), h('p', { class: 'muted' }, 'Card payments are not enabled yet.')); return; }
      const err = h('div');
      const custom = h('input', { type: 'number', id: 'b-amt', min: 5, max: 500, step: '1', inputmode: 'decimal', placeholder: '20', style: 'max-width:120px' });
      async function checkout(cents, btn) {
        err.replaceChildren();
        if (!(cents >= 500 && cents <= 50000)) { err.appendChild(errorBox({ message: 'Amount must be between $5 and $500.' })); return; }
        btn.disabled = true;
        try {
          const r = await api('POST', '/v1/billing/checkout', { amount_cents: cents }, { signal: ctx.signal });
          const u = safeUrl(r.data && r.data.url);
          if (!u) throw new Error('The server did not return a checkout URL.');
          location.href = u.href;
        } catch (e) {
          if (isAbort(e)) return;
          btn.disabled = false;
          if (e.code === 'payments_disabled') { data.payments_enabled = false; renderTopup(); return; }
          err.appendChild(errorBox(e));
        }
      }
      const customBtn = h('button', { type: 'submit', class: 'btn' }, 'Pay');
      const customForm = h('form', { class: 'row', style: 'margin-top:8px', novalidate: true }, h('label', { class: 'inline', for: 'b-amt' }, 'Other amount ($)'), custom, customBtn);
      customForm.addEventListener('submit', (e) => { e.preventDefault(); checkout(dollarsToCents(custom.value), customBtn); });
      fill(topup, h('h2', null, 'Add funds'),
        h('div', { class: 'btnrow' }, [500, 1000, 2500, 5000].map((c) => {
          const b = h('button', { type: 'button', class: 'btn' }, fmtUsd(c));
          b.addEventListener('click', () => checkout(c, b));
          return b;
        })),
        customForm,
        h('p', { class: 'hint' }, 'You will be redirected to the card payment page and brought back here.'), err);
    }

    function renderPayout() {
      const amt = h('input', { type: 'number', id: 'po-amt', min: 10, step: '0.01', inputmode: 'decimal', style: 'max-width:140px' });
      const dest = h('input', { type: 'text', id: 'po-dest', maxlength: 200, autocomplete: 'off', placeholder: 'e.g. PayPal email' });
      const err = h('div');
      const btn = h('button', { type: 'submit', class: 'btn' }, 'Request payout');
      const form = h('form', { novalidate: true }, h('h2', null, 'Request a payout'),
        h('div', { class: 'field' }, h('label', { for: 'po-amt' }, 'Amount (USD, minimum $10.00)'), amt),
        h('div', { class: 'field' }, h('label', { for: 'po-dest' }, 'Destination'), dest,
          h('div', { class: 'hint' }, 'Where to send the money. Only earnings (not top-ups or credit grants) can be paid out; requests are reviewed and sent manually.')),
        btn, err);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.replaceChildren();
        const c = dollarsToCents(amt.value);
        if (c == null || c < 1000) { err.appendChild(errorBox({ message: 'Minimum payout is $10.00.' })); return; }
        if (!dest.value.trim()) { err.appendChild(errorBox({ message: 'Enter a destination.' })); return; }
        btn.disabled = true;
        try {
          const r = await api('POST', '/v1/billing/payouts', { amount_cents: c, destination: dest.value.trim() }, { signal: ctx.signal });
          amt.value = ''; dest.value = '';
          err.appendChild(okBox('Payout of ' + fmtUsd(c) + ' requested' + (r.data && r.data.id ? ' (' + r.data.id + ')' : '') + '.'));
          load().catch(() => {}); loadMe(true);
        } catch (ex) { if (!isAbort(ex)) err.appendChild(errorBox(ex)); }
        finally { btn.disabled = false; }
      });
      fill(payout, form);
    }

    await load();
    renderTopup(); renderPayout();
    if (paid) {
      loadMe(true);
      [3000, 8000].forEach((ms) => {
        const t = setTimeout(() => { load().catch(() => {}); loadMe(true); }, ms);
        ctx.onLeave(() => clearTimeout(t));
      });
    }
  }

  /* =========================================================================
   * Admin  #/admin
   * ======================================================================= */
  async function viewAdmin(ctx) {
    setTitle('Admin');
    await loadMe();
    if (ctx.signal.aborted) return;
    add(main, h('h1', null, 'Admin'));
    if (!S.me || S.me.is_admin !== true) { add(main, errorBox({ status: S.me ? 403 : 401, message: 'Admins only.' })); return; }
    const reportsP = h('section', { class: 'panel' });
    const payoutsP = h('section', { class: 'panel' });
    const creditP = h('section', { class: 'panel' });
    add(main, h('div', { class: 'grid2' }, reportsP, payoutsP), creditP);

    // Runs an admin action from a button, shows errors in `slot`, then reloads.
    function act(btn, slot, fn, reload) {
      btn.addEventListener('click', async () => {
        slot.replaceChildren();
        btn.disabled = true;
        try { await fn(); await reload(); }
        catch (e) {
          if (ctx.signal.aborted) return;
          if (!isAbort(e)) slot.appendChild(errorBox(e)); // AbortError here = a cancelled confirm()
          btn.disabled = false;
        }
      });
      return btn;
    }
    const post = (path, body) => api('POST', path, body, { signal: ctx.signal });

    async function loadReports() {
      const err = h('div');
      try {
        const r = await api('GET', '/v1/admin/reports', undefined, { signal: ctx.signal });
        const all = r.data && Array.isArray(r.data.reports) ? r.data.reports.filter(isObj) : [];
        const open = all.filter((x) => x.status === 'open');
        const row = (x, actions) => h('li', null,
          h('div', { class: 'row' },
            h('a', { href: '#/s/' + enc(x.service) }, x.service_name || x.service),
            h('span', { class: 'badge' }, String(x.service_status || '?')),
            h('span', { class: 'badge' }, String(x.reason || '?')),
            h('span', { class: 'muted small' }, 'by @' + x.reporter + ' · ' + fmtAgo(x.created_at))),
          x.detail ? h('p', { class: 'desc small', style: 'margin:4px 0' }, String(x.detail)) : null,
          actions ? h('div', { class: 'row' }, actions) : null);
        fill(reportsP, h('h2', null, 'Open reports (' + open.length + ')'), err,
          open.length ? h('ul', { class: 'plain' }, open.map((x) => row(x, [
            act(h('button', { type: 'button', class: 'btn btn-sm' }, 'Dismiss'), err, () => post('/v1/admin/reports/' + enc(x.id) + '/resolve', { action: 'dismiss' }), loadReports),
            x.service_status === 'suspended'
              ? act(h('button', { type: 'button', class: 'btn btn-sm' }, 'Reactivate listing'), err, () => post('/v1/admin/services/' + enc(x.service) + '/status', { status: 'active' }), loadReports)
              : act(h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, 'Suspend listing'), err, () => post('/v1/admin/reports/' + enc(x.id) + '/resolve', { action: 'suspend' }), loadReports),
          ]))) : h('p', { class: 'muted' }, 'No open reports.'),
          all.length > open.length ? h('details', null, h('summary', { class: 'small' }, (all.length - open.length) + ' resolved'),
            h('ul', { class: 'plain' }, all.filter((x) => x.status !== 'open').map((x) => row(x, x.service_status === 'suspended'
              ? [act(h('button', { type: 'button', class: 'btn btn-sm' }, 'Reactivate listing'), err, () => post('/v1/admin/services/' + enc(x.service) + '/status', { status: 'active' }), loadReports)]
              : null)))) : null);
      } catch (e) { if (!isAbort(e)) fill(reportsP, h('h2', null, 'Reports'), errorBox(e)); }
    }

    async function loadPayouts() {
      const err = h('div');
      try {
        const r = await api('GET', '/v1/admin/payouts', undefined, { signal: ctx.signal });
        const all = r.data && Array.isArray(r.data.payouts) ? r.data.payouts.filter(isObj) : [];
        const pend = all.filter((p) => p.status === 'requested');
        const line = (p) => [h('b', { class: 'mono' }, fmtUsd(p.amount_cents)), ' to ', h('code', null, String(p.destination || '?')),
          h('span', { class: 'muted small' }, ' @' + p.handle + ' · ' + fmtAgo(p.created_at))];
        fill(payoutsP, h('h2', null, 'Payout requests (' + pend.length + ')'), err,
          pend.length ? h('ul', { class: 'plain' }, pend.map((p) => h('li', null, h('div', null, line(p)), h('div', { class: 'row', style: 'margin-top:4px' },
            act(h('button', { type: 'button', class: 'btn btn-sm' }, 'Mark paid'), err, async () => {
              if (!window.confirm('Mark ' + fmtUsd(p.amount_cents) + ' to ' + p.destination + ' as paid? Send the money first.')) throw new DOMException('Aborted', 'AbortError');
              return post('/v1/admin/payouts/' + enc(p.id), { status: 'paid' });
            }, loadPayouts),
            act(h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, 'Reject'), err, () => post('/v1/admin/payouts/' + enc(p.id), { status: 'rejected' }), loadPayouts)))))
            : h('p', { class: 'muted' }, 'No pending payout requests.'),
          all.length > pend.length ? h('details', null, h('summary', { class: 'small' }, 'History'),
            h('ul', { class: 'plain' }, all.filter((p) => p.status !== 'requested').map((p) => h('li', { class: 'small' }, line(p), ' · ', h('b', null, String(p.status)))))) : null);
      } catch (e) { if (!isAbort(e)) fill(payoutsP, h('h2', null, 'Payouts'), errorBox(e)); }
    }

    const ch = h('input', { type: 'text', id: 'cr-handle', autocomplete: 'off', spellcheck: 'false' });
    const ca = h('input', { type: 'number', id: 'cr-amt', min: 0.01, step: '0.01', inputmode: 'decimal' });
    const cn = h('input', { type: 'text', id: 'cr-note', maxlength: 200, autocomplete: 'off' });
    const cErr = h('div');
    const cBtn = h('button', { type: 'submit', class: 'btn' }, 'Grant credit');
    const cForm = h('form', { novalidate: true }, h('h2', null, 'Grant credit'),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', { for: 'cr-handle' }, 'Handle'), ch),
        h('div', { class: 'field' }, h('label', { for: 'cr-amt' }, 'Amount (USD)'), ca)),
      h('div', { class: 'field' }, h('label', { for: 'cr-note' }, 'Note (optional)'), cn), cBtn, cErr);
    cForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      cErr.replaceChildren();
      const handle = ch.value.trim().replace(/^@/, '').toLowerCase();
      const c = dollarsToCents(ca.value);
      if (!handle || !c) { cErr.appendChild(errorBox({ message: 'Enter a handle and a positive amount.' })); return; }
      cBtn.disabled = true;
      try {
        const body = { handle, amount_cents: c };
        if (cn.value.trim()) body.note = cn.value.trim();
        await post('/v1/admin/credit', body);
        cErr.appendChild(okBox('Granted ' + fmtUsd(c) + ' to @' + handle + '.'));
        ca.value = ''; cn.value = '';
        if (handle === S.me.handle) loadMe(true);
      } catch (ex) { if (!isAbort(ex)) cErr.appendChild(errorBox(ex)); }
      finally { cBtn.disabled = false; }
    });
    fill(creditP, cForm);
    await Promise.all([loadReports(), loadPayouts()]);
  }

  /* =========================================================================
   * Boot
   * ======================================================================= */
  window.addEventListener('unhandledrejection', (e) => { if (isAbort(e.reason)) e.preventDefault(); });
  document.getElementById('skip').addEventListener('click', (e) => { e.preventDefault(); main.focus(); });
  window.addEventListener('hashchange', route);
  loadMe();
  // Vocabulary and layout depend on meta (storefront or not), so render after it settles.
  loadMeta().then(() => { applyChrome(); route(); });
})();
