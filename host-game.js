import { supabase } from './supabase-client.js';
import { renderGame } from './game-view.js';
import { quizzes, quizIds } from './quiz-catalog.js';
const el = id => document.getElementById(id);
const starter = [
  {text:'Какая планета самая большая в Солнечной системе?',options:['Земля','Марс','Юпитер','Венера'],correct:2,duration:30},
  {text:'Сколько сторон у шестиугольника?',options:['4','5','6','8'],correct:2,duration:20},
  {text:'Кто написал «Евгения Онегина»?',options:['Пушкин','Толстой','Чехов','Гоголь'],correct:0,duration:30},
  {text:'Какой океан самый большой?',options:['Атлантический','Индийский','Северный Ледовитый','Тихий'],correct:3,duration:30},
  {text:'Сколько минут в двух часах?',options:['60','90','120','200'],correct:2,duration:20}
];
let current, refresh, pending = false;
let draftKey = 'quizroom_questions';
try { draftKey += `_${sessionStorage.getItem('quizroom_room_code') || ''}`; } catch {}
function questionCard(q) {
  const field = document.createElement('fieldset');
  const legend = document.createElement('legend'); legend.textContent = 'Вопрос'; field.append(legend);
  const add = (label, control) => { const l=document.createElement('label'); l.textContent=label; l.append(control); field.append(l); return control; };
  const text = document.createElement('textarea'); text.maxLength=500; text.value=q.text; text.dataset.field='text'; add('Текст вопроса',text);
  q.options.forEach((value,i) => { const input=document.createElement('input'); input.maxLength=200; input.value=value; input.dataset.option=String(i); add(`Вариант ${i+1}`,input); });
  const select=document.createElement('select'); select.dataset.field='correct';
  for(let i=0;i<4;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`Вариант ${i+1}`;select.append(option);} select.value=String(q.correct);add('Правильный ответ',select);
  const duration=document.createElement('input');duration.type='number';duration.min='5';duration.max='300';duration.value=q.duration;duration.dataset.field='duration';add('Время на ответ, секунд',duration);
  const remove=document.createElement('button');remove.type='button';remove.textContent='Удалить вопрос';remove.addEventListener('click',()=>{field.remove();saveDraft();});field.append(remove);
  el('questionEditor').append(field);
}
function questions() {
  return [...el('questionEditor').children].map(field=>({text:field.querySelector('[data-field="text"]').value.trim(),options:[...field.querySelectorAll('[data-option]')].map(input=>input.value.trim()),correct:Number(field.querySelector('[data-field="correct"]').value),duration:Number(field.querySelector('[data-field="duration"]').value)}));
}
function saveDraft(){try{sessionStorage.setItem(draftKey,JSON.stringify(questions()));}catch{/* Draft stays usable in memory. */}}
let initial=starter;
try {
  const selection = sessionStorage.getItem(`quizroom_quiz_${sessionStorage.getItem('quizroom_room_code')}`);
  const chosen = quizzes[quizIds.indexOf(selection)];
  if (chosen) {
    initial = chosen.questions.map(q => ({text:q.q,options:[...q.a],correct:q.correct,duration:30}));
    el('quizTitle').textContent = `Квиз «${chosen.title}»`;
  }
} catch {}
try { const saved=JSON.parse(sessionStorage.getItem(draftKey)); if(Array.isArray(saved)&&saved.length&&saved.every(q=>typeof q.text==='string'&&Array.isArray(q.options)&&q.options.length===4)) initial=saved; }catch{}
initial.forEach(questionCard);
el('questionEditor').addEventListener('input',saveDraft);
el('addQuestion').addEventListener('click',()=>{if(el('questionEditor').children.length<50){questionCard({text:'',options:['','','',''],correct:0,duration:30});saveDraft();}});
async function control(action) {
  if(pending || !current) return;
  pending=true; updateButtons();el('gameError').textContent='';
  try {
    const list=action==='start'?questions():null;
    if(list && (!list.length || list.some(q=>!q.text||q.options.some(o=>!o)||!Number.isInteger(q.duration)||q.duration<5||q.duration>300))) throw new Error('Заполните вопросы, четыре варианта и время от 5 до 300 секунд.');
    const {data,error}=await supabase.rpc('control_quiz_game',{p_code:sessionStorage.getItem('quizroom_room_code'),p_host_secret:sessionStorage.getItem('quizroom_host_secret'),p_action:action,p_questions:list,p_question_id:current.question?.id||null});
    if(error) throw error;
    renderHostGame(data,refresh);void refresh();
  } catch(error){el('gameError').textContent=error.message||'Не удалось выполнить действие. Попробуйте ещё раз.';}
  finally {pending=false;updateButtons();}
}
for(const [id,action] of [['startGame','start'],['revealAnswer','reveal'],['nextQuestion','next'],['finishGame','finish']]) el(id).addEventListener('click',()=>{void control(action);});
function updateButtons(){
  if(!current) return;
  el('startGame').disabled=pending||current.players.length===0;
  el('revealAnswer').hidden=current.phase!=='question';
  el('nextQuestion').hidden=current.phase!=='reveal';
  el('nextQuestion').textContent=current.question?.number===current.total_questions?'Показать итоги':'Следующий вопрос';
  el('finishGame').hidden=current.status!=='playing';
  for(const id of ['revealAnswer','nextQuestion','finishGame']) el(id).disabled=pending;
}
export function renderHostGame(data,reload){
  current=data;refresh=reload;
  el('setup').hidden=data.status!=='waiting';
  renderGame(data);
  updateButtons();
  if(data.status!=='waiting')el('status').textContent=data.status==='finished'?'Игра завершена':'Игра идёт';
}
