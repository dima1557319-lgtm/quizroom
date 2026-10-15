import { supabase } from './supabase-client.js';
import { renderGame, renderRanking } from './game-view.js?v=20261015-scoring';
const el=id=>document.getElementById(id);
let id,secret;
try{id=sessionStorage.getItem('quizroom_player_id');secret=sessionStorage.getItem('quizroom_player_secret');}catch{}
let channel,timer,busy=false,again=false,stopped=false,sending=false,connected=false;
function stop(){stopped=true;clearInterval(timer);if(channel)void supabase.removeChannel(channel);}
async function answer(question,option){
 if(sending||stopped)return;sending=true;el('error').textContent='';
 for(const b of document.querySelectorAll('[data-answer]')){b.dataset.sending='true';b.disabled=true;}
 try{
  const {error}=await supabase.rpc('submit_quiz_answer',{p_player_id:id,p_player_secret:secret,p_question_id:question,p_option:option});
  if(error)throw error;
 }catch(e){el('error').textContent=e.message||'Не удалось отправить ответ. Попробуйте ещё раз.';}
 finally{sending=false;for(const b of document.querySelectorAll('[data-answer]'))b.dataset.sending='false';void refresh();}
}
async function refresh(){
 if(stopped||!id||!secret)return;if(busy){again=true;return;}busy=true;
 try{
  const {data,error}=await supabase.rpc('get_quiz_game_player',{p_player_id:id,p_player_secret:secret});if(error)throw error;
  if(stopped)return;
  const me=data.players.find(p=>p.player_id===id);
  el('identity').textContent=`${me?.player_name||'Игрок'} · Комната ${data.room_code}`;
  el('status').textContent=data.status==='waiting'?'Вы в игре! Ожидаем начала.':data.status==='finished'?'Игра завершена':'Выберите один вариант ответа';
  renderGame(data,answer);renderRanking(data.players,el('ranking'));el('rankingTitle').hidden=data.status==='waiting';
  el('connection').textContent=connected?'Обновление в реальном времени подключено':'Резервное обновление каждые 2 секунды';
  if(!channel)channel=supabase.channel(data.realtime_topic,{config:{private:false}}).on('broadcast',{event:'lobby_changed'},()=>{void refresh();}).subscribe(s=>{connected=s==='SUBSCRIBED';if(connected)void refresh();});
 }catch(e){
  if(['42501','28000'].includes(e.code)){stop();el('game').hidden=true;el('ranking').replaceChildren();el('status').textContent='Доступ потерян. Войдите в комнату заново.';}
  else{el('connection').textContent='Нет связи. Данные могут быть устаревшими; восстанавливаем подключение…';}
 }finally{busy=false;if(again){again=false;void refresh();}}
}
if(id&&secret){sessionStorage.removeItem('quizroom_host_secret');sessionStorage.removeItem('quizroom_room_code');sessionStorage.setItem('quizroom_role','player');timer=setInterval(()=>{if(!document.hidden)void refresh();},2000);void refresh();}
else el('status').textContent='Сначала войдите в комнату по QR-коду или ссылке.';
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
window.addEventListener('pagehide',stop);
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
