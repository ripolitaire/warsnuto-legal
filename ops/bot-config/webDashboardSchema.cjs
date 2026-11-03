const crypto = require('node:crypto');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { publicMessage: message, status }); };
const field = (key, label, type, options = {}) => ({ key, label, type, ...options });
const boolean = (key, label) => field(key, label, 'boolean');
const number = (key, label, min, max, step = 1) => field(key, label, 'number', { min, max, step });
const text = (key, label, maxLength = 300, options = {}) => field(key, label, 'text', { maxLength, ...options });
const channel = (key, label, channelTypes = [0, 5]) => field(key, label, 'channel', { channelTypes });
const role = (key, label, assignable = false) => field(key, label, 'role', { assignable });
const roles = (key, label, maxItems = 25, assignable = false) => field(key, label, 'roles', { maxItems, assignable });
const channels = (key, label, maxItems = 50) => field(key, label, 'channels', { maxItems, channelTypes: [0, 2, 5, 13, 15, 16] });
const list = (key, label, itemFields, maxItems = 25, minItems = 0) => field(key, label, 'list', { itemFields: itemFields.map(f => ['role', 'channel'].includes(f.type) ? { ...f, required: true } : f), maxItems, minItems });
const select = (key, label, choices) => field(key, label, 'select', { choices });
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('Formulaire invalide.');
}
function validate(values, fields) {
  object(values); const result = {};
  for (const key of Object.keys(values)) {
    const f = fields.find(f => f.key === key); if (!f) fail('Réglage inconnu.');
    const value = values[key], invalid = () => fail('Valeur invalide : ' + f.label + '.');
    if (f.type === 'boolean') { if (typeof value !== 'boolean') invalid(); }
    else if (f.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < f.min || value > f.max || (f.step === 1 && !Number.isSafeInteger(value))) invalid();
    } else if (['role', 'channel'].includes(f.type)) { if ((value === null && f.required) || (value !== null && (typeof value !== 'string' || !/^\d{17,20}$/.test(value)))) invalid(); }
    else if (['roles', 'channels', 'ids', 'lines'].includes(f.type)) {
      if (!Array.isArray(value) || value.length > (f.maxItems || 50) || new Set(value).size !== value.length || value.some(v => typeof v !== 'string' || (f.type === 'lines' ? !v.trim() || v.length > (f.maxLength || 100) : !/^\d{17,20}$/.test(v)))) invalid();
    } else if (f.type === 'list') {
      if (!Array.isArray(value) || value.length > f.maxItems || value.length < f.minItems) invalid();
      result[key] = value.map(item => { const row = validate(item, f.itemFields); if (f.itemFields.some(child => !Object.hasOwn(row, child.key))) invalid(); return row; }); continue;
    } else if (f.type === 'select') { if (!f.choices.some(c => c.value === value)) invalid(); }
    else {
      if (typeof value !== 'string' || value.length > (f.maxLength || 300) || (f.required && !value.trim()) || (f.pattern && !new RegExp(f.pattern).test(value))) invalid();
      if (f.type === 'url' && value) { try { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password) invalid(); } catch { invalid(); } }
      if (f.type === 'datetime' && value && (!Number.isFinite(Date.parse(value)) || !/Z$/.test(value))) invalid();
    }
    result[key] = value;
  }
  return result;
}
const at = (object, key) => key.split('.').reduce((value, segment) => value?.[segment], object);
function pick(config, fields) {
  return Object.fromEntries(fields.map(f => {
    let value = at(config, f.key);
    if (value === undefined || value === null) value = ['roles', 'channels', 'ids', 'list', 'lines'].includes(f.type) ? [] : ['role', 'channel'].includes(f.type) ? null : f.type === 'boolean' ? false : f.type === 'number' ? f.min : '';
    if (f.type === 'list') value = value.map(row => pick(row, f.itemFields));
    return [f.key, value];
  }));
}
function unflat(values) {
  const output = {};
  for (const [key, value] of Object.entries(values)) { const parts = key.split('.'); let target = output; for (const segment of parts.slice(0, -1)) target = target[segment] ||= {}; target[parts.at(-1)] = value; }
  return output;
}
function fingerprint(value) {
  const stable = input => Array.isArray(input) ? input.map(stable) : input && typeof input === 'object' ? Object.fromEntries(Object.keys(input).sort().map(key => [key, stable(input[key])])) : input;
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function section(id, label, fields, get, set, extra = {}) {
  return { id, label, fields, read: guild => pick(get(guild), fields), write: (guild, values, actor, patch = values) => set(guild, unflat(values), actor, unflat(patch)), ...extra };
}
module.exports = { fail, field, boolean, number, text, channel, channels, role, roles, list, select, validate, pick, unflat, fingerprint, section, object };
