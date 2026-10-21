import {gameRpc} from './game-rpc.js?v=connect1';
import {installAccessBackup} from './game-access.js?v=play2';
import { supabase } from './supabase-client.js?v=connect1';
import { renderGame, renderRanking } from './game-view.js?v=answers1';
import { renderEveryoneControls } from './player-controls.js?v=classic3';
import {renderClassic} from './classic-view.js?v=answers1';
import {renderGameSummary} from './game-summary.js?v=fold1';
import {newestClassic} from './classic-document.js?v=classic3';
const el=id=>document.getElementById(id);
function connectionStatus(text,warning=false){el('connection').textContent=text;el('connection').hidden=!warning;}
let id,secret;
try{id=sessionStorage.getItem('quizroom_player_id');secret=sessionStorage.getItem('quizroom_player_secret');}catch{}
let channel,timer,busy=false,again=false,stopped=false,sending=false,connected=false;
let current,controlling=false;
async function control(action){
 if(controlling||!current?.can_control||stopped)return;
 controlling=true;renderEveryoneControls(current,true);el('error').textContent='';
 try{
  const {error}=await gameRpc(current.format==='classic'?'classic_action':'control_quiz_everyone',current.format==='classic'?{p_player_id:id,p_player_secret:secret,p_action:action,p_version:current.classic.version}:{p_player_id:id,p_player_secret:secret,p_action:action,p_question_id:current.question?.id||null});
  if(error)throw error;
 }catch(e){el('error').textContent=e.message||'Не удалось выполнить действие. Обновляем состояние игры.';}
 finally{controlling=false;void refresh();}
}
el('everyoneStart').addEventListener('click',()=>{void control('start');});
el('everyoneNext').addEventListener('click',()=>{void control('next');});
function stop(){stopped=true;clearInterval(timer);if(channel)void supabase.removeChannel(channel);}
async function classicRequest(name,args){
 let {data,error}=await gameRpc(name,{...args,p_player_id:id,p_player_secret:secret});data=newestClassic(current,data);
 if(error)throw error;el('error').textContent='';current=data;renderEveryoneControls(data,false);renderClassic(data,classicRequest);renderGameSummary(data);renderRanking(data.players,el('ranking'));void refresh();return data;
}
async function answer(question,option){
 if(sending||stopped)return;sending=true;el('error').textContent='';
 for(const b of document.querySelectorAll('[data-answer],[data-rich-answer]')){b.dataset.sending='true';b.disabled=true;}
 try{
  const modern=typeof option==='object';
  const {error}=await gameRpc(modern?'submit_quiz_response':'submit_quiz_answer',modern?{p_player_id:id,p_player_secret:secret,p_question_id:question,p_response:option}:{p_player_id:id,p_player_secret:secret,p_question_id:question,p_option:option});
  if(error)throw error;
 }catch(e){el('error').textContent=e.message||'Не удалось отправить ответ. Попробуйте ещё раз.';}
 finally{sending=false;for(const b of document.querySelectorAll('[data-answer],[data-rich-answer]'))b.dataset.sending='false';void refresh();}
}
async function refresh(){
 if(stopped||!id||!secret)return;if(busy){again=true;return;}busy=true;
 try{
  let {data,error}=await gameRpc('get_quiz_game_player',{p_player_id:id,p_player_secret:secret});if(error)throw error;data=newestClassic(current,data);
  if(stopped)return;
  current=data;renderEveryoneControls(data,controlling);
  const me=data.players.find(p=>p.player_id===id);
  el('identity').textContent=`${me?.player_name||'Игрок'} · Комната ${data.room_code}`;
  el('status').textContent=data.status==='waiting'?'Вы в игре! Ожидаем начала.':data.status==='finished'?'Игра завершена':data.phase==='reveal'?'Вопрос закрыт':data.question?.kind==='multiple'?'Выберите один или несколько вариантов': ['text','manual'].includes(data.question?.kind)?'Введите текст ответа':'Выберите один вариант ответа';
  if(data.format==='classic'){el('game').hidden=true;renderClassic(data,classicRequest);renderGameSummary(data);el('status').textContent=data.status==='waiting'?'Ожидаем игроков':data.status==='finished'?'Игра завершена':'Многораундовая игра';}
  else{const classic=document.getElementById('classicGame');if(classic)classic.hidden=true;renderGame(data,answer);}
  renderRanking(data.players,el('ranking'));el('rankingTitle').hidden=data.status==='waiting';
  connectionStatus(connected?'Обновление в реальном времени подключено':'Резервное обновление каждые 2 секунды');
  if(!channel)channel=supabase.channel(data.realtime_topic,{config:{private:false}}).on('broadcast',{event:'lobby_changed'},()=>{void refresh();}).subscribe(s=>{connected=s==='SUBSCRIBED';if(connected)void refresh();});
 }catch(e){
  if(['42501','28000'].includes(e.code)){stop();el('everyoneControls').hidden=true;el('game').hidden=true;el('ranking').replaceChildren();el('status').textContent='Доступ потерян. Войдите в комнату заново.';}
  else{const detail=e?.message||'Ошибка соединения';connectionStatus(current?'Не удалось обновить игру. Повторяем подключение…':'Не удалось загрузить игру. '+detail+' Повторяем подключение…',true);if(!current)el('status').textContent='Не удалось получить состояние комнаты';}
 }finally{busy=false;if(again){again=false;void refresh();}}
}
if(id&&secret){sessionStorage.removeItem('quizroom_host_secret');sessionStorage.removeItem('quizroom_room_code');sessionStorage.setItem('quizroom_role','player');timer=setInterval(()=>{if(!document.hidden)void refresh();},2000);void refresh();}
else el('status').textContent='Сначала войдите в комнату по QR-коду или ссылке.';
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
window.addEventListener('pagehide',stop);
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});

installAccessBackup('player');
window.addEventListener('online',()=>{void refresh();});
window.addEventListener('offline',()=>{connectionStatus('Нет сети. После восстановления соединения игра обновится автоматически.',true);});
