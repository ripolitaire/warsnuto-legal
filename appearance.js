(() => {
  'use strict';
  const root = document.documentElement, key = 'wn-appearance-v1';
  const normalize = value => ({ theme: ['dark', 'light', 'system'].includes(value?.theme) ? value.theme : 'dark', density: value?.density === 'compact' ? 'compact' : 'comfortable', reducedMotion: value?.reducedMotion === true });
  let current;
  function apply(value, { persist = true } = {}) {
    current = normalize(value);
    root.dataset.theme = current.theme; root.dataset.density = current.density; root.dataset.reducedMotion = String(current.reducedMotion);
    document.body?.classList.toggle('reduced-motion', current.reducedMotion);
    const light = current.theme === 'light' || current.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f8f8fa' : '#050506');
    if (persist) { try { localStorage.setItem(key, JSON.stringify(current)); } catch { /* The account preference still works when local storage is blocked. */ } }
  }
  let initial = {};
  if (root.dataset.accountAppearance === 'true') initial = { theme: root.dataset.theme, density: root.dataset.density, reducedMotion: root.dataset.reducedMotion === 'true' };
  else { try { initial = JSON.parse(localStorage.getItem(key) || '{}'); } catch {} }
  apply(initial, { persist: false });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (current.theme === 'system') apply(current, { persist: false }); });
  window.wnAppearance = { apply };
})();
