// Minimal JSON Schema subset: enough to describe typed service interfaces.
// Supported: type, enum, const, properties, required, additionalProperties:false,
// items, minItems, maxItems, minimum, maximum, minLength, maxLength, pattern, format:uri.

const TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
const KEYS = new Set([
  'type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern',
  'format', 'description', 'title', 'default', 'examples',
]);

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matchesType(t, v) {
  const actual = typeOf(v);
  return t === actual || (t === 'number' && actual === 'integer');
}

// Returns a list of problems with the schema itself (empty = usable).
export function checkSchema(s, path = '$', depth = 0) {
  const errs = [];
  if (depth > 8) return [`${path}: nested too deeply`];
  if (typeOf(s) !== 'object') return [`${path}: schema must be an object`];
  for (const k of Object.keys(s)) if (!KEYS.has(k)) errs.push(`${path}: unsupported keyword "${k}"`);
  const types = s.type === undefined ? [] : [].concat(s.type);
  if (!types.length && s.enum === undefined && s.const === undefined) errs.push(`${path}: needs a "type"`);
  for (const t of types) if (!TYPES.includes(t)) errs.push(`${path}: unknown type "${t}"`);
  if (s.enum !== undefined && (!Array.isArray(s.enum) || !s.enum.length)) errs.push(`${path}: enum must be a non-empty array`);
  if (s.required !== undefined && (!Array.isArray(s.required) || s.required.some((r) => typeof r !== 'string'))) errs.push(`${path}: required must be an array of strings`);
  if (s.pattern !== undefined) {
    try { new RegExp(s.pattern); } catch { errs.push(`${path}: invalid pattern`); }
    if (String(s.pattern).length > 200) errs.push(`${path}: pattern too long`);
  }
  if (s.properties !== undefined) {
    if (typeOf(s.properties) !== 'object') errs.push(`${path}: properties must be an object`);
    else for (const [k, sub] of Object.entries(s.properties)) errs.push(...checkSchema(sub, `${path}.${k}`, depth + 1));
  }
  if (s.items !== undefined) errs.push(...checkSchema(s.items, `${path}[]`, depth + 1));
  return errs;
}

// Returns a list of validation errors for value v against schema s (empty = valid).
export function validate(s, v, path = '$') {
  const errs = [];
  if (s.type !== undefined) {
    const types = [].concat(s.type);
    if (!types.some((t) => matchesType(t, v))) return [`${path}: expected ${types.join('|')}, got ${typeOf(v)}`];
  }
  if (s.const !== undefined && JSON.stringify(v) !== JSON.stringify(s.const)) errs.push(`${path}: must equal ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) errs.push(`${path}: must be one of ${JSON.stringify(s.enum)}`);
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) errs.push(`${path}: must be >= ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) errs.push(`${path}: must be <= ${s.maximum}`);
  }
  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.length < s.minLength) errs.push(`${path}: shorter than ${s.minLength}`);
    if (s.maxLength !== undefined && v.length > s.maxLength) errs.push(`${path}: longer than ${s.maxLength}`);
    if (s.pattern !== undefined && v.length <= 10000 && !new RegExp(s.pattern).test(v)) errs.push(`${path}: does not match ${s.pattern}`);
    if (s.format === 'uri' && !/^https?:\/\/\S+$/i.test(v)) errs.push(`${path}: must be an http(s) URL`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) errs.push(`${path}: fewer than ${s.minItems} items`);
    if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(`${path}: more than ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => { if (errs.length < 20) errs.push(...validate(s.items, x, `${path}[${i}]`)); });
  }
  if (typeOf(v) === 'object') {
    for (const r of s.required || []) if (!(r in v)) errs.push(`${path}.${r}: required`);
    for (const [k, x] of Object.entries(v)) {
      const sub = s.properties && Object.hasOwn(s.properties, k) ? s.properties[k] : null;
      if (sub) errs.push(...validate(sub, x, `${path}.${k}`));
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: unexpected property`);
    }
  }
  return errs.slice(0, 20);
}

// Compact human/agent-readable signature, e.g. {image_url: uri} or {rating: integer 1..10}
export function summarize(s, depth = 0) {
  if (!s || typeof s !== 'object') return 'any';
  if (s.enum) return s.enum.map((e) => JSON.stringify(e)).join(' | ');
  const t = [].concat(s.type || 'any').join('|');
  if (t === 'object' && s.properties && depth < 3) {
    const req = new Set(s.required || []);
    return '{' + Object.entries(s.properties).map(([k, v]) => `${k}${req.has(k) ? '' : '?'}: ${summarize(v, depth + 1)}`).join(', ') + '}';
  }
  if (t === 'array') return `${s.items ? summarize(s.items, depth + 1) : 'any'}[]`;
  if (t === 'string' && s.format) return s.format;
  if ((t === 'integer' || t === 'number') && (s.minimum !== undefined || s.maximum !== undefined)) return `${t} ${s.minimum ?? ''}..${s.maximum ?? ''}`;
  return t;
}
