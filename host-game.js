import {gameRpc} from './game-rpc.js?v=play2';
import {renderGame,formatPoints} from './game-view.js?v=answers1';
const el=id=>document.getElementById(id);
let current,refresh,pending=false,setupKey='',gradingKey='';
function setup(data){
 const key=JSON.stringify([data.room_code,data.quiz_title,data.setup_questions]);if(key===setupKey)return;setupKey=key;
 el('quizTitle').textContent=`Квиз «${data.quiz_title||'Готовый квиз'}»`;
 el('setupHelp').textContent=data.quiz_key==='custom'?'Создание квизов перенесено в закрытый раздел администратора. Создайте новую комнату с готовым квизом.':'Вопросы, баллы, время и правила задаёт администратор. Ведущий управляет ходом игры.';
 el('questionEditor').replaceChildren();
 for(const [i,q]of (data.setup_questions||[]).entries()){
  const field=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent=`${q.round?q.round+' · ':''}Вопрос ${i+1}`;const text=document.createElement('p');text.textContent=q.text;const info=document.createElement('p');info.textContent=`Баллы: ${formatPoints(q.points)} · Время: ${q.duration} сек.`;field.append(legend,text,info);el('questionEditor').append(field);
 }
}
function grading(data){
 const rows=data.pending_answers||[];const key=JSON.stringify(rows.map(a=>a.id));if(key===gradingKey)return;gradingKey=key;el('hostGrading').replaceChildren();if(!rows.length)return;
 const h=document.createElement('h3');h.textContent='Ответы для ручной проверки';el('hostGrading').append(h);
 for(const row of rows){
  const form=document.createElement('form');const text=document.createElement('p');text.textContent=`${row.player} · ${row.question}: ${row.response.text}`;const label=document.createElement('label');label.textContent=`Баллы (0–${formatPoints(row.max_points)})`;const input=document.createElement('input');input.inputMode='decimal';input.required=true;input.value='0';label.append(input);const button=document.createElement('button');button.textContent='Сохранить оценку';form.append(text,label,button);
  form.addEventListener('submit',async e=>{e.preventDefault();const value=input.value.trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(value)){el('gameError').textContent='Укажите число с точностью до сотых.';return;}button.disabled=true;try{const {data,error}=await gameRpc('grade_quiz_response',{p_code:sessionStorage.getItem('quizroom_room_code'),p_host_secret:sessionStorage.getItem('quizroom_host_secret'),p_answer_id:row.id,p_points:Number(value)});if(error)throw error;renderHostGame(data,refresh);void refresh();}catch(error){el('gameError').textContent=error.message;button.disabled=false;void refresh();}});el('hostGrading').append(form);
 }
}
async function control(action){
 if(pending||!current)return;pending=true;buttons();el('gameError').textContent='';
 try{const {data,error}=await gameRpc('control_quiz_game_v2',{p_code:sessionStorage.getItem('quizroom_room_code'),p_host_secret:sessionStorage.getItem('quizroom_host_secret'),p_action:action,p_questions:null,p_question_id:current.question?.id||null,p_scoring_mode:current.scoring_mode||'reveal'});if(error)throw error;renderHostGame(data,refresh);void refresh();}catch(e){el('gameError').textContent=e.message;void refresh();}finally{pending=false;buttons();}
}
for(const [id,action]of [['startGame','start'],['revealAnswer','reveal'],['nextQuestion','next']])el(id).addEventListener('click',()=>{void control(action);});
el('finishGame').addEventListener('click',()=>{if(pending||!current)return;const dialog=el('finishConfirm');dialog.returnValue='';dialog.addEventListener('close',()=>{if(dialog.returnValue==='finish')void control('finish');},{once:true});dialog.showModal();});
function buttons(){if(!current)return;el('startGame').disabled=pending||!current.players.length||!current.setup_questions?.length;el('revealAnswer').hidden=current.phase!=='question';el('revealAnswer').textContent=current.question?.kind?(current.reveal_timing==='question'?'Закрыть вопрос и показать ответ':'Закрыть вопрос'):'Показать правильный ответ';el('nextQuestion').hidden=current.phase!=='reveal';el('nextQuestion').textContent=current.question?.number===current.total_questions?'Показать итоги':current.question?.round_end?'Начать следующий тур':'Следующий вопрос';el('finishGame').hidden=current.status!=='playing';for(const id of ['revealAnswer','nextQuestion','finishGame'])el(id).disabled=pending;el('nextQuestion').disabled=pending||!!current.pending_answers?.length;el('finishGame').disabled=pending||!!current.pending_answers?.length;}
export function renderHostGame(data,reload){current=data;refresh=reload;if(data.status==='waiting')setup(data);el('setup').hidden=data.status!=='waiting';renderGame(data);grading(data);buttons();if(data.status!=='waiting')el('status').textContent=data.status==='finished'?'Игра завершена':'Игра идёт';}
