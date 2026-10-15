(() => {
  'use strict';
  const key = 'quizroom_theme';
  const modes = ['dark', 'light', 'system'];
  const colorKey = 'quizroom_accent';
  const colors = [['purple','Фиолетовый'],['blue','Синий'],['green','Зелёный'],['yellow','Жёлтый'],['orange','Оранжевый'],['red','Красный']];
  const validColor = value => colors.some(([id]) => id === value);
  let accent = 'purple';
  let colorSelector;
  const system = window.matchMedia('(prefers-color-scheme: light)');
  let preference = 'dark';
  let selector;
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) preference = saved;
    const savedColor = localStorage.getItem(colorKey);
    if (validColor(savedColor)) accent = savedColor;
  } catch { /* The choice still works when storage is unavailable. */ }
  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'light' : 'dark') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f6f4fc' : '#0b0920';
    if (selector) selector.value = preference;
    if (colorSelector) colorSelector.value = accent;
  }
  apply();
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = modes.includes(event.newValue) ? event.newValue : 'dark';
      apply();
    }
    if (event.key === colorKey || event.key === null) {
      accent = validColor(event.newValue) ? event.newValue : 'purple';
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
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Цвет';
    colorSelector = document.createElement('select');
    colorSelector.setAttribute('aria-label','Основной цвет');
    for (const [value,title] of colors) {
      const option = document.createElement('option');
      option.value = value; option.textContent = title; colorSelector.append(option);
    }
    colorSelector.value = accent;
    colorSelector.addEventListener('change', () => {
      accent = colorSelector.value;
      try { localStorage.setItem(colorKey,accent); } catch {}
      apply();
    });
    colorLabel.append(colorSelector); container.append(colorLabel);
    const header = document.querySelector('header');
    if (header) header.append(container);
    else (document.querySelector('main') || document.body).prepend(container);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
