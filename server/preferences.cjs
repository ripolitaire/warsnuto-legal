const { error, object } = require('./security.cjs');
const DEFAULTS = Object.freeze({ theme: 'dark', density: 'comfortable', reducedMotion: false, autoRefresh: true, showProfileBanner: true, hideBalances: false });
const choices = { theme: ['dark', 'light', 'system'], density: ['comfortable', 'compact'] };
function normalizePreferences(stored) {
  let value;
  try { value = typeof stored === 'string' ? JSON.parse(stored) : stored; } catch { value = null; }
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [key, choices[key] ? choices[key].includes(value?.[key]) ? value[key] : fallback : typeof value?.[key] === 'boolean' ? value[key] : fallback]));
}
function validatePreferences(input) {
  object(input, Object.keys(DEFAULTS));
  if (!Object.keys(input).length) throw error(400, 'Aucune préférence à enregistrer.');
  for (const [key, value] of Object.entries(input)) if (choices[key] ? !choices[key].includes(value) : typeof value !== 'boolean') throw error(400, 'Préférence invalide : ' + key + '.');
  return input;
}
module.exports = { DEFAULTS, normalizePreferences, validatePreferences };
