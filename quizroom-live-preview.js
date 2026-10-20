/* QuizRoom editor UX enhancement. Additive: does not modify quiz document or save logic. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds = {single:'Один ответ',multiple:'Несколько ответов',text:'Текстовый ответ',manual:'Проверяет ведущий'};
  const state = new WeakMap();
  function build(card) {
    if (state.has(card)) return;
    const fields = [...card.querySelectorAll('label')];
    const named = prefix => fields.find(l => l.textContent.trim().startsWith(prefix))?.querySelector('input,textarea,select');
    const question = named('Текст вопроса');
    const kind = named('Тип ответа');
    if (!question || !kind) return;
    const panel = document.createElement('aside');
    panel.className = 'qr-live-preview';
    panel.setAttribute('aria-label','Предпросмотр карточки вопроса');
    panel.innerHTML = '<div class="qr-live-preview__head"><strong>Предпросмотр для игроков</strong><span>Обновляется при вводе</span></div><div class="qr-live-preview__body"></div>';
    question.closest('label')?.before(panel);
    const render = () => {
      const type = kind.value;
      const seconds = named('Время на ответ')?.value || '30';
      const points = named('Баллы за правильный ответ')?.value || '1';
      const options = [...card.querySelectorAll('.option-row')].map(row => row.querySelector('input:not([type=radio]):not([type=checkbox])')?.value || '');
      const text = question.value.trim() || 'Введите текст вопроса…';
      const body = panel.querySelector('.qr-live-preview__body');
      const choices = ['single','multiple'].includes(type)
        ? `<div class="qr-live-preview__choices">${options.map((v,i)=>`<div class="qr-live-preview__choice"><b>${String.fromCharCode(65+i)}</b><span>${esc(v || `Вариант ${i+1}`)}</span></div>`).join('')}</div>`
        : `<div class="qr-live-preview__free">${type==='manual'?'Игрок введёт ответ, ведущий оценит его':'Игрок введёт текстовый ответ'}</div>`;
      body.innerHTML = `<div class="qr-live-preview__meta"><span>${esc(kinds[type]||type)}</span><span>⏱ ${esc(seconds)} сек.</span><span>★ ${esc(points)} балл.</span></div><h3>${esc(text)}</h3>${choices}<p class="qr-live-preview__note">Предпросмотр не раскрывает правильный ответ. Медиа отображаются в исходном редакторе.</p>`;
    };
    card.addEventListener('input', render);
    card.addEventListener('change', render);
    state.set(card, render);
    render();
  }
  function scan() { document.querySelectorAll('#roundEditor .question-card').forEach(build); }
  const root = document.getElementById('roundEditor');
  if (!root) return;
  new MutationObserver(scan).observe(root, {childList:true,subtree:true});
  scan();
})();
