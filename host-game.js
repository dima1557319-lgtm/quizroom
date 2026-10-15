import { supabase } from './supabase-client.js';
import { renderGame } from './game-view.js?v=20261015-scoring';
const el = id => document.getElementById(id);
let current, refresh, pending=false, initialized=false, editable=false;
const draftKey = `quizroom_scoring_${sessionStorage.getItem('quizroom_room_code') || ''}`;
function questionCard(q, index) {
 const field=document.createElement('fieldset');
 const legend=document.createElement('legend');legend.textContent=`Вопрос ${index+1}`;field.append(legend);
 const add=(label,control)=>{const l=document.createElement('label');l.textContent=label;l.append(control);field.append(l);};
 if(editable){
  const text=document.createElement('textarea');text.maxLength=500;text.value=q.text;text.dataset.field='text';add('Текст вопроса',text);
  q.options.forEach((v,i)=>{const input=document.createElement('input');input.maxLength=200;input.value=v;input.dataset.option=String(i);add(`Вариант ${i+1}`,input);});
  const select=document.createElement('select');select.dataset.field='correct';
  for(let i=0;i<4;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`Вариант ${i+1}`;select.append(o);}select.value=String(q.correct);add('Правильный ответ',select);
 }else{
  const text=document.createElement('p');text.textContent=q.text;field.append(text);
  const list=document.createElement('ol');q.options.forEach(v=>{const li=document.createElement('li');li.textContent=v;list.append(li);});field.append(list);
 }
 const points=document.createElement('input');points.type='text';points.inputMode='decimal';points.value=String(q.points ?? 1).replace('.',',');points.dataset.field='points';add('Баллы за правильный ответ (например, 0,5)',points);
 const duration=document.createElement('input');duration.type='number';duration.min='5';duration.max='300';duration.value=q.duration??30;duration.dataset.field='duration';add('Время на ответ, секунд',duration);
 if(editable){const remove=document.createElement('button');remove.type='button';remove.textContent='Удалить вопрос';remove.addEventListener('click',()=>{field.remove();saveDraft();});field.append(remove);}
 el('questionEditor').append(field);
}
function questions(){return [...el('questionEditor').children].map(field=>{
 const pointsText=field.querySelector('[data-field="points"]').value.trim().replace(',','.');
 if(!/^\d{1,5}(\.\d{1,2})?$/.test(pointsText)||Number(pointsText)>10000)throw new Error('Укажите баллы от 0 до 10000, не более двух знаков после запятой.');
 const q={points:Number(pointsText),duration:Number(field.querySelector('[data-field="duration"]').value)};
 if(editable)Object.assign(q,{text:field.querySelector('[data-field="text"]').value.trim(),options:[...field.querySelectorAll('[data-option]')].map(i=>i.value.trim()),correct:Number(field.querySelector('[data-field="correct"]').value)});
 return q;
});}
function saveDraft(){try{sessionStorage.setItem(draftKey,JSON.stringify({questions:questions(),mode:el('scoringMode').value}));}catch{/* Invalid unfinished inputs stay in the form. */}}
function initialize(data){
 editable=data.can_edit_content===true;
 let initial=editable?[{text:'',options:['','','',''],correct:0,duration:30,points:1}]:data.setup_questions;
 let mode=data.scoring_mode;
 try{const saved=JSON.parse(sessionStorage.getItem(draftKey));if(Array.isArray(saved?.questions)&&saved.questions.length&&saved.questions.length<=50){if(editable&&saved.questions.every(q=>typeof q.text==='string'&&q.options?.length===4))initial=saved.questions;else if(!editable&&saved.questions.length===initial.length)initial=initial.map((q,i)=>({...q,points:saved.questions[i].points,duration:saved.questions[i].duration}));}if(['reveal','finish'].includes(saved?.mode))mode=saved.mode;}catch{}
 el('scoringMode').value=mode||'reveal';
 el('quizTitle').textContent=editable?'Создать свой квиз':`Квиз «${data.quiz_title}»`;
 el('setupHelp').textContent=editable?'Создайте вопросы и задайте баллы для каждого. После начала игры редактирование закрывается.':'Вопросы и правильные ответы готового квиза закреплены. Настройте баллы и время для каждого вопроса до начала игры.';
 el('addQuestion').hidden=!editable;
 (initial||[]).forEach(questionCard);initialized=true;
}
el('questionEditor').addEventListener('input',saveDraft);el('scoringMode').addEventListener('change',saveDraft);
el('addQuestion').addEventListener('click',()=>{if(editable&&el('questionEditor').children.length<50){questionCard({text:'',options:['','','',''],correct:0,duration:30,points:1},el('questionEditor').children.length);saveDraft();}});
async function control(action){
 if(pending||!current)return;pending=true;updateButtons();el('gameError').textContent='';
 try{
  const list=action==='start'?questions():null;
  if(list&&(!list.length||list.some(q=>!Number.isInteger(q.duration)||q.duration<5||q.duration>300||(editable&&(!q.text||q.options.some(o=>!o))))))throw new Error('Заполните вопросы, четыре варианта и время от 5 до 300 секунд.');
  const {data,error}=await supabase.rpc('control_quiz_game_v2',{p_code:sessionStorage.getItem('quizroom_room_code'),p_host_secret:sessionStorage.getItem('quizroom_host_secret'),p_action:action,p_questions:list,p_question_id:current.question?.id||null,p_scoring_mode:el('scoringMode').value});
  if(error)throw error;renderHostGame(data,refresh);void refresh();
 }catch(e){el('gameError').textContent=e.message||'Не удалось выполнить действие. Попробуйте ещё раз.';}finally{pending=false;updateButtons();}
}
for(const [id,action] of [['startGame','start'],['revealAnswer','reveal'],['nextQuestion','next'],['finishGame','finish']])el(id).addEventListener('click',()=>{void control(action);});
function updateButtons(){
 if(!current)return;el('startGame').disabled=pending||!initialized||current.players.length===0;
 el('revealAnswer').hidden=current.phase!=='question';el('nextQuestion').hidden=current.phase!=='reveal';
 el('nextQuestion').textContent=current.question?.number===current.total_questions?'Показать итоги':'Следующий вопрос';
 el('finishGame').hidden=current.status!=='playing';for(const id of ['revealAnswer','nextQuestion','finishGame'])el(id).disabled=pending;
}
export function renderHostGame(data,reload){
 current=data;refresh=reload;
 if(data.status==='waiting'&&!initialized)initialize(data);
 el('setup').hidden=data.status!=='waiting';renderGame(data);updateButtons();
 if(data.status!=='waiting')el('status').textContent=data.status==='finished'?'Игра завершена':'Игра идёт';
}
