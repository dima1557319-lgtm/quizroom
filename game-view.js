import {renderRichGame} from './rich-game.js?v=studio1';
export const formatPoints = value => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2}).format(Number(value));
const el = id => document.getElementById(id);
let state, offset = 0, renderKey;
export function remaining() {
  if (!state?.question) return 0;
  return Math.max(0, Math.ceil((Date.parse(state.question.deadline) - (Date.now() + offset)) / 1000));
}
export function renderGame(data, onAnswer) {
  state = data;
  offset = Date.parse(data.server_now) - Date.now();
  const q = data.question;
  const finished = data.status === 'finished';
  el('game').hidden = data.status === 'waiting';
  if (data.status === 'waiting') return;
  if(q?.kind){renderRichGame(data,onAnswer);tick();return;}
  el('roundTitle').textContent = finished ? 'Игра завершена — итоговые результаты' : `Вопрос ${q?.number || 0} из ${data.total_questions} · Баллы за ответ: ${formatPoints(q?.points ?? 1000)}`;
  el('questionText').textContent = finished ? 'Спасибо за игру!' : q?.text || '';
  el('answerStatus').textContent = finished ? 'Места в таблице определяются по очкам. При равенстве очков — ничья.' :
    data.phase === 'reveal' ? `Правильный ответ: ${q.options[q.correct_option]}${data.scoring_mode === 'finish' ? ' · Баллы появятся в конце квиза.' : ''}` :
    data.my_answer != null ? 'Ответ принят. Ожидаем остальных игроков.' : `Ответили: ${data.answer_count} из ${data.players.length}`;
  const key = JSON.stringify([q?.id, data.phase, data.my_answer, !!onAnswer, finished]);
  if (key !== renderKey) {
    renderKey = key;
    const items = finished || !q ? [] : q.options.map((text, index) => {
      const item = document.createElement(onAnswer ? 'button' : 'div');
      item.className = 'option';
      item.textContent = `${index + 1}. ${text}`;
      if (index === q.correct_option && data.phase === 'reveal') item.classList.add('correct');
      if (index === data.my_answer) item.classList.add('selected');
      if (onAnswer) {
        item.type = 'button';
        item.dataset.answer = String(index);
        item.addEventListener('click', () => { void onAnswer(q.id, index); });
      }
      return item;
    });
    el('options').replaceChildren(...items);
  }
  tick();
}
function tick() {
  if (!state || state.status === 'waiting') return;
  const seconds = remaining();
  el('gameTimer').textContent = state.phase === 'question' ? (seconds ? `Осталось: ${seconds} сек.` : 'Время вышло. Ожидаем ведущего.') : '';
  for(const control of document.querySelectorAll('[data-rich-answer]')) control.disabled=state.phase!=='question'||state.my_response!=null||seconds===0||control.dataset.sending==='true';
  for (const button of document.querySelectorAll('[data-answer]')) {
    button.disabled = state.phase !== 'question' || state.my_answer != null || seconds === 0 || button.dataset.sending === 'true';
  }
}
setInterval(tick, 250);

export function renderRanking(players, target) {
  let lastScore, rank;
  target.replaceChildren(...players.map((p, i) => {
    if (p.score !== lastScore) rank = i + 1;
    lastScore = p.score;
    const li = document.createElement('li');
    li.textContent = `${rank}. ${p.player_name} — баллы: ${formatPoints(p.score)}`;
    return li;
  }));
}
