import {gameRpc} from './game-rpc.js?v=play2';
import {installAccessBackup} from './game-access.js?v=play2';
import { supabase } from './supabase-client.js';
import { renderHostGame } from './host-game.js?v=answers1';

import { formatPoints } from './game-view.js?v=answers1';
const byId = (id) => document.getElementById(id);
let channel, timer, busy = false, again = false, stopped = false, subscribed = false;
let roomCode, hostSecret;
const deny = () => {
  byId('lobby').hidden = true;
  byId('players').replaceChildren();
  byId('status').textContent = 'Нет доступа к комнате. Откройте исходную вкладку или восстановите доступ из сохранённого файла.';
};

// Contract is documented in README. Never subscribe to publicly readable player rows.
async function refresh() {
  if(stopped)return;if(busy){again=true;return;}
  busy = true;
  byId('refresh').disabled = true;
  try {
    const { data, error } = await gameRpc('get_quiz_game_host', {
      p_code: roomCode, p_host_secret: hostSecret
    });
    if (error) {
      if (['42501', '28000'].includes(error.code)) {
        stop();
        deny();
        return;
      }
      throw error;
    }
    if (stopped) return;
    if (!data || !Array.isArray(data.players) ||
        data.players.length > 20 || data.room_code !== roomCode ||
        data.players.some(p => typeof p.player_name !== 'string')) {
      throw new Error('Invalid lobby response');
    }
    const nodes = data.players.map(player => {
      const item = document.createElement('li');
      item.textContent = `${player.player_name} — баллы: ${formatPoints(player.score)}`;
      return item;
    });
    byId('players').replaceChildren(...nodes);
    byId('count').textContent = `Игроки: ${nodes.length} / 20`;
    byId('capacity').value = nodes.length;
    byId('empty').hidden = nodes.length !== 0;
    byId('lobby').hidden = false;
    byId('status').textContent = nodes.length === 20 ? 'Комната заполнена' : 'Комната готова к подключению';
    renderHostGame(data, refresh);
    byId('connection').textContent = subscribed ? 'Обновление в реальном времени подключено' : 'Резервное обновление каждые 2 секунды';
    if (!channel && typeof data.realtime_topic === 'string' && data.realtime_topic.length >= 32) {
      // Random capability topic carries invalidation only, never names or tokens.
      channel = supabase.channel(data.realtime_topic, { config: { private: false } })
        .on('broadcast', { event: 'lobby_changed' }, () => { void refresh(); })
        .subscribe(state => {
          subscribed = state === 'SUBSCRIBED';
          byId('connection').textContent = subscribed ? 'Обновление в реальном времени подключено' : 'Связь восстанавливается; резервное обновление каждые 2 секунды';
          if (subscribed) queueMicrotask(() => { void refresh(); });
        });
    }
  } catch {
    byId('status').textContent = 'Не удалось обновить данные. Проверьте подключение к сети.';
    byId('connection').textContent = 'Список может быть устаревшим';
  } finally {
    busy = false;
    byId('refresh').disabled = false;if(again){again=false;queueMicrotask(()=>{void refresh();});}
  }
}

function stop() {
  stopped = true;
  clearInterval(timer);
  if (channel) void supabase.removeChannel(channel);
}

try {
  roomCode = sessionStorage.getItem('quizroom_room_code');
  hostSecret = sessionStorage.getItem('quizroom_role') === 'player' || sessionStorage.getItem('quizroom_player_secret') ? null : sessionStorage.getItem('quizroom_host_secret');
} catch { /* Storage can be unavailable in restrictive browsers. */ }
if (!/^\d{6}$/.test(roomCode || '') || !hostSecret || hostSecret === 'undefined') {
  deny();
} else {
  byId('code').textContent = roomCode;
  const joinURL = new URL('./join.html', location.href);
  joinURL.searchParams.set('code', roomCode);
  byId('join').href = joinURL.href;
  byId('refresh').addEventListener('click', () => { void refresh(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  timer = setInterval(() => { if (!document.hidden) void refresh(); }, 2000);
  void refresh();
}
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

installAccessBackup('host');
window.addEventListener('online',()=>{void refresh();});
window.addEventListener('offline',()=>{document.getElementById('connection').textContent='Нет сети. После восстановления соединения игра обновится автоматически.';});
