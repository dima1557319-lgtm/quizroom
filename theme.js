(() => {
  'use strict';
  const key = 'quizroom_theme';
  const modes = ['dark', 'light', 'system'];
  const system = window.matchMedia('(prefers-color-scheme: light)');
  let preference = 'dark';
  let selector;
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) preference = saved;
  } catch { /* The choice still works when storage is unavailable. */ }
  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'light' : 'dark') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f6f4fc' : '#0b0920';
    if (selector) selector.value = preference;
  }
  apply();
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = modes.includes(event.newValue) ? event.newValue : 'dark';
      apply();
    }
  });
  function mount() {
    if (document.querySelector('.theme-switcher')) return;
    const container = document.createElement('div');
    container.className = 'theme-switcher';
    const label = document.createElement('label');
    label.textContent = 'Тема';
    selector = document.createElement('select');
    selector.setAttribute('aria-label', 'Тема оформления');
    for (const [value, title] of [['dark','Тёмная'],['light','Светлая'],['system','Как на устройстве']]) {
      const option = document.createElement('option');
      option.value = value; option.textContent = title; selector.append(option);
    }
    selector.value = preference;
    selector.addEventListener('change', () => {
      preference = selector.value;
      try { localStorage.setItem(key, preference); } catch { /* No storage is required for changing the current page. */ }
      apply();
    });
    label.append(selector); container.append(label);
    const header = document.querySelector('header');
    if (header) header.append(container);
    else (document.querySelector('main') || document.body).prepend(container);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
