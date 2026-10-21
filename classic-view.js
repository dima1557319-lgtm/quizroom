import {answerExplanation} from './answer-explanation.js?v=answers1';
import {CountdownSound} from './countdown-sound.js?v=tick1';
import {prepareClassicMedia} from './classic-preflight.js?v=media1';
import {stakePolicy} from './classic-document.js?v=classic3';
import {renderMedia} from './quiz-media.js?v=studio1';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
const countdownSound=new CountdownSound();let soundDocument;
let signature='',latest,offset=0,local=new Map(),requester,pending=false,screen=false,preflightReady=true;
export function resetClassicView(){signature='';local=new Map();latest=null;screen=false;}
const phaseNames={intro:'Правила тура',media_wait:'Медиа на общем экране',question:'Обсуждение вопроса',question_done:'Обсуждение завершено',answer:'Разбор вопроса',repeat:'Повтор вопросов',submit:'Сдача бланков',review:'Разбор тура',round_results:'Результаты тура',break:'Перерыв',finished:'Итоги игры'};
export function classicActionLabel(c){return {intro:'Начать тур',question_done:'Следующий вопрос',answer:'Следующий вопрос',review:'Результаты тура',round_results:c.round_no===c.round_count?'Завершить игру':'Продолжить',break:'Продолжить после перерыва',media_wait:'Медиа завершено — запустить обсуждение'}[c.phase]||null;}
function storageKey(id){return `quizroom_classic_draft_${sessionStorage.getItem('quizroom_player_id')||'preview'}_${id}`;}
function remember(id,value){try{if(!latest?.preview)sessionStorage.setItem(storageKey(id),JSON.stringify(value));}catch{}}
function fromServer(id){return latest.classic.drafts.find(d=>d.question_id===id)||{response:null,stake:0,revision:0,locked:false};}
function valueFor(q){
 if(!local.has(q.id)){const server=fromServer(q.id);let saved;try{if(!latest.preview)saved=JSON.parse(sessionStorage.getItem(storageKey(q.id)));}catch{}
  local.set(q.id,saved?.dirty?saved:{...server,dirty:false});
 }
 const value=local.get(q.id),server=fromServer(q.id);
 if(!value.dirty&&server.revision!==value.revision)local.set(q.id,{...server,dirty:false});
 return local.get(q.id);
}
async function send(name,args){if(pending)return;pending=true;tick();try{return await requester(name,args);}finally{pending=false;tick();}}
function canEdit(c,q,server){return latest.status==='playing'&&!c.submitted&&!server.locked&&['question','question_done','repeat','submit'].includes(c.phase)&&(c.rules.submission==='round'||c.phase==='question'&&q.number===c.cursor);}
function makeQuestion(q,c){
 const rules=q.rules||c.rules;const section=node('section');section.className='classic-card'+(q.animation==='fade'?' classic-fade':'');section.dataset.classicQuestion=q.id;
 const countdown=node('div');countdown.className='classic-card-countdown';countdown.setAttribute('role','timer');countdown.dataset.questionTimer=q.id;section.append(countdown);
 const meta=node('div');meta.className='classic-card-meta';
 const kinds={single:'Один ответ',multiple:'Несколько ответов',text:'Текстовый ответ',manual:'Проверяет ведущий'};
 for(const text of [`Вопрос ${q.number}`,kinds[q.kind]||q.kind,`★ ${q.points} балл.`,...(q.duration!=null?[`⏱ ${q.duration} сек.`]:[]),...(q.difficulty?[q.difficulty]:[])])meta.append(node('span',text));
 const heading=node('h3',q.text);heading.className='classic-card-title';section.append(meta,heading);
 const media=node('div');renderMedia(q.media,media);
 if(q.media_start!=null){const player=media.querySelector('audio,video');if(player){player.src=q.media.url.split('#')[0]+`#t=${q.media_start},${q.media_end}`;player.addEventListener('timeupdate',()=>{if(player.currentTime>=q.media_end)player.pause();});}}
 section.append(media);
 const form=node('form'),value=valueFor(q);
 if(['single','multiple'].includes(q.kind)){const choices=node('div');choices.className='classic-choices';form.append(choices);q.options.forEach((text,i)=>{const label=node('label');const input=node('input');input.type=q.kind==='single'?'radio':'checkbox';input.name='choice-'+q.id;input.value=i;input.checked=value.response?.choices?.includes(i)||false;const letter=node('b',String.fromCharCode(65+i));letter.className='classic-choice-letter';letter.setAttribute('aria-hidden','true');label.className='classic-choice';label.append(input,letter,node('span',text));choices.append(label);});}
 else {const label=node('label','Ваш ответ');const input=node('textarea');input.maxLength=500;input.value=value.response?.text||'';label.append(input);form.append(label);}
 const stakeLabel=node('label','Ставка');const stake=node('select');stake.name='stake';for(const amount of rules.stakes){const policy=stakePolicy(rules,amount);const option=node('option',`Ставка ${amount}: верно ${Number(q.points)+policy.correct_bonus}, ошибка ${policy.wrong}`);option.value=amount;option.selected=Number(amount)===Number(value.stake||0);stake.append(option);}stakeLabel.append(stake);form.append(stakeLabel);
 const status=node('p');status.dataset.draftStatus=q.id;form.append(status);
 form.addEventListener('input',()=>{const response=['single','multiple'].includes(q.kind)?{choices:[...form.querySelectorAll('input:checked')].map(i=>Number(i.value))}:{text:form.querySelector('textarea').value.trim()};value.response=response.choices?.length===0||response.text===''?null:response;value.stake=value.response?Number(stake.value):0;value.dirty=true;remember(q.id,value);status.textContent='Не отправлено. Сохраните ответ.';});
 const save=node('button',rules.submission==='round'?'Сохранить ответ':'Отправить окончательный ответ');save.type='submit';form.append(save);
 form.addEventListener('submit',async event=>{event.preventDefault();if(!canEdit(latest.classic,q,fromServer(q.id)))return;save.disabled=true;
  try{const result=await send('classic_save_response',{p_question_id:q.id,p_response:value.response,p_stake:value.response?value.stake:0,p_revision:value.revision});if(result){const accepted=result.classic.drafts.find(d=>d.question_id===q.id);Object.assign(value,accepted,{dirty:false});remember(q.id,value);renderClassic(result,requester);status.textContent='Сохранено на сервере';}}
  catch(error){status.textContent=error.message||'Не удалось сохранить. Проверьте связь.';}finally{tick();}
 });
 const restore=node('button','Загрузить серверный ответ');restore.type='button';restore.dataset.restore=q.id;restore.addEventListener('click',()=>{local.set(q.id,{...fromServer(q.id),dirty:false});remember(q.id,local.get(q.id));signature='';renderClassic(latest,requester);});form.append(restore);section.append(form);
 if(q.revealed&&q.answer){const answer=q.answer.accepted?.length?q.answer.accepted.join('; '):(q.answer.choices||[]).map(i=>q.options[i]).join('; ');section.append(node('p','Правильный ответ: '+answer),node('p',answerExplanation(q.answer.explanation)));const revealMedia=node('div');renderMedia(q.answer.media,revealMedia);section.append(revealMedia);}
 const award=c.awards?.find(a=>a.question_id===q.id);if(award){const result=node('p',`Начислено: ${Number(award.points)>0?'+':''}${award.points} балл. · ставка ${award.stake} · ${award.correct?'верный ответ':Number(award.points)>0?'частичный зачёт':'ошибка или пропуск'}`);result.className='classic-award';section.append(result);}
 return section;
}
function roundRulesView(r){
 const list=node('ul');list.className='classic-rules-list';
 const item=(title,text)=>{const li=node('li');li.append(node('strong',title),node('span',text));list.append(li);return li;};
 const timing=value=>value==='question'?'После вопроса':value==='round'?'После тура':'В конце игры';
 if(r.theme)item('Тема тура',r.theme);
 item('Ответы',r.submission==='round'?'Можно менять до сдачи бланка':'Каждый отправленный ответ окончательный');
 item('Повтор вопросов',r.repeat?`${r.repeat_seconds} сек.`:'Без повтора');
 if(r.submission==='round')item('Сдача бланка',`${r.submit_seconds} сек.`);
 if(r.stakes.length>1||r.stake_policy){const li=item('Ставки','Пропуск — 0 баллов');const stakes=node('ul');for(const amount of r.stakes){const p=stakePolicy(r,amount);stakes.append(node('li',`Ставка ${amount}: верно — стоимость ${p.correct_bonus<0?'−':'+'} ${Math.abs(p.correct_bonus)}; ошибка — ${p.wrong}.`));}li.append(stakes);}
 else item('Ставки','Без ставок. Ошибка и пропуск — 0 баллов');
 item('Разбор ответов',timing(r.reveal_timing));item('Начисление баллов',timing(r.score_timing));
 if(r.text){const li=item('Об этом туре','');const extra=node('ul');for(const line of r.text.split(/(?<=[.!?])\s+|\n+/u).filter(t=>t.trim()))extra.append(node('li',line));li.append(extra);}
 return list;
}
export function renderClassic(data,request){
 if(soundDocument!==document){soundDocument=document;for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>countdownSound.unlock(),{passive:true});}
 latest=data;requester=request;offset=Date.parse(data.server_now)-Date.now();
 let root=document.getElementById('classicGame');if(!root){root=node('section');root.id='classicGame';document.getElementById('game').after(root);}root.hidden=false;
 if(data.status==='waiting'){const waitingKey=JSON.stringify(['waiting',data.room_code,data.quiz_cover?.url]);if(signature!==waitingKey){signature=waitingKey;root.replaceChildren();const cover=node('div');cover.className='classic-cover';renderMedia(data.quiz_cover,cover);root.append(cover,node('p','Все участники играют. Первый вошедший запускает игру, затем на экране появятся правила первого тура.'));}return;}
 const c=data.classic;
 const key=JSON.stringify([data.room_code,c.version,c.phase,c.questions.map(q=>[q.id,q.revealed]),c.awards,c.submitted,c.drafts.map(d=>[d.question_id,d.locked]),data.can_control,screen]);
 if(signature!==key){signature=key;preflightReady=!c.preflight?.length;root.replaceChildren();if(c.phase==='intro'&&c.round_no===1&&data.quiz_cover){const cover=node('div');cover.className='classic-cover';renderMedia(data.quiz_cover,cover);root.append(cover);}root.append(node('h2',`${c.round_no} / ${c.round_count} · ${c.round_title}`),node('h3',phaseNames[c.phase]||c.phase));
  const timer=node('p');timer.id='classicTimer';timer.setAttribute('role','timer');root.append(timer);
  const soundToggle=node('button');soundToggle.type='button';soundToggle.dataset.countdownSound='true';
  const updateSoundIcon=()=>{const enabled=countdownSound.enabled;soundToggle.textContent=enabled?'🔊':'🔇';soundToggle.setAttribute('aria-pressed',String(enabled));soundToggle.setAttribute('aria-label',enabled?'Выключить звук таймера':'Включить звук таймера');soundToggle.title=enabled?'Звук таймера включён':'Звук таймера выключен';};updateSoundIcon();soundToggle.addEventListener('click',()=>{countdownSound.toggle();updateSoundIcon();});root.append(soundToggle);
  const rules=node('details');rules.className='classic-round-rules';rules.open=c.phase==='intro';rules.append(node('summary','Правила этого тура'),roundRulesView(c.rules));root.append(rules);
  const toggle=node('button',screen?'Вернуться к своим ответам':'Показать общий экран без моих ответов');toggle.type='button';toggle.addEventListener('click',()=>{screen=!screen;signature='';renderClassic(latest,requester);});root.append(toggle);
  if(c.phase==='media_wait')root.append(node('p','Воспроизведите фрагмент на общем экране. Организатор запустит обсуждение после окончания фрагмента; при ошибке загрузки время на ответ не расходуется.'));
  if(c.submitted)root.append(node('p','Бланк сдан. Ответы и ставки зафиксированы.'));
  if(c.phase==='intro')root.append(node('p','Все готовы? Организатор начинает тур.'));
  else if(!['break','round_results'].includes(c.phase)){
   const qs=c.rules.submission==='question'&&['question','question_done','answer','media_wait'].includes(c.phase)?c.questions.filter(q=>q.number===c.cursor):c.questions;
   for(const q of qs){const card=makeQuestion(q,c);if(screen)card.querySelector('form').hidden=true;root.append(card);}
  }
  if(['round_results','finished'].includes(c.phase)){const table=node('table');const head=node('tr');for(const label of ['Место','Игрок','Туры (по порядку)','Сумма'])head.append(node('th',label));table.append(head);for(const p of data.players){const tr=node('tr');for(const text of [p.rank,p.player_name,(p.round_scores||[]).slice().reverse().join(' / '),p.score])tr.append(node('td',String(text)));table.append(tr);}root.append(table);}
  if(['repeat','submit'].includes(c.phase)&&c.rules.submission==='round'&&!c.submitted&&!screen){
   const submit=node('button','Сдать бланк тура');submit.type='button';submit.dataset.classicSubmit='true';submit.addEventListener('click',()=>{
    const unsaved=c.questions.filter(q=>valueFor(q).dirty).length;
    const message=node('p');message.setAttribute('role','alert');if(unsaved){message.textContent=`Сначала сохраните изменённые ответы (${unsaved}) или загрузите серверные варианты.`;submit.after(message);return;}
    const blanks=c.questions.filter(q=>!fromServer(q.id).response).length;
    const dialog=node('dialog');dialog.append(node('h3','Сдать тур?'),node('p',`Пустых ответов: ${blanks}. После сдачи изменить ответы и ставки нельзя.`));const cancel=node('button','Продолжить редактирование'),confirm=node('button','Подтвердить сдачу');cancel.onclick=()=>dialog.close();confirm.onclick=async()=>{confirm.disabled=true;try{await send('classic_submit_round',{p_round:c.round_no});dialog.close();}catch(error){dialog.append(node('p',error.message));confirm.disabled=false;}};dialog.append(cancel,confirm);dialog.addEventListener('close',()=>dialog.remove());root.append(dialog);dialog.showModal();
   });root.append(submit);
  }
  const label=classicActionLabel(c);if(data.can_control&&label){const next=node('button',label);next.type='button';next.dataset.classicControl='true';next.addEventListener('click',async()=>{next.disabled=true;try{await send('classic_action',{p_action:c.phase==='media_wait'?'media_ready':'advance',p_version:c.version});}catch(error){root.append(node('p',error.message));}finally{tick();}});root.append(next);}
  if(c.phase==='intro')prepareClassicMedia(root,c.preflight,value=>{preflightReady=value;tick();});
 }
 for(const q of c.questions){const status=root.querySelector(`[data-draft-status="${q.id}"]`);if(status){const value=valueFor(q),server=fromServer(q.id);status.textContent=value.dirty?(value.revision!==server.revision?'Серверный ответ изменился. Загрузите его перед дальнейшей правкой.':'Не отправлено. Сохраните ответ.'):server.locked?'Ответ зафиксирован':server.revision?'Сохранено на сервере':'Ответ ещё не сохранён';root.querySelector(`[data-restore="${q.id}"]`).hidden=!value.dirty&&value.revision===server.revision;}}
 tick();
}
function tick(){
 if(!latest||latest.status==='waiting')return;const c=latest.classic;const left=c.deadline?Math.max(0,Math.ceil((Date.parse(c.deadline)-Date.now()-offset)/1000)):null;
 let visible=!document.hidden;try{const frame=document.defaultView?.frameElement;if(frame?.checkVisibility)visible&&=frame.checkVisibility();}catch{}
 countdownSound.update({remaining:left,stage:JSON.stringify([latest.room_code,c.round_no,c.phase,c.cursor,c.deadline]),active:latest.status==='playing'&&!c.submitted&&['question','media_wait','repeat','submit'].includes(c.phase)&&c.questions.length>0,visible});
 const timer=document.getElementById('classicTimer');if(timer)timer.textContent=left==null?'':left?`Осталось: ${left} сек.`:c.phase==='media_wait'?'Фрагмент завершён. Организатор запускает обсуждение.':'Время этапа вышло. Обновляем состояние…';
 for(const q of c.questions){const card=document.querySelector(`[data-classic-question="${q.id}"]`);if(!card)continue;
  const countdown=card.querySelector('[data-question-timer]');
  if(countdown){
   const seconds=left==null?'':`${left} сек.`;
   let label='Обсуждение завершено';
   if(c.phase==='question'&&q.number===c.cursor)label=left===0?'Время на ответ вышло':`⏱ На ответ: ${seconds}`;
   else if(c.phase==='media_wait'&&q.number===c.cursor)label=left===0?'Медиа завершено · ожидаем обсуждения':`⏱ Медиа: ${seconds}`;
   else if(c.phase==='repeat')label=left===0?'Повтор завершён':`⏱ Повтор вопросов: ${seconds}`;
   else if(c.phase==='submit')label=left===0?'Время сдачи вышло':`⏱ До сдачи бланка: ${seconds}`;
   else if(['answer','review','finished'].includes(c.phase))label='Разбор ответа';
   if(c.submitted)label='Бланк сдан';
   if(countdown.textContent!==label)countdown.textContent=label;
   countdown.classList.toggle('is-urgent',left!=null&&left<=10&&left>0&&((c.phase==='question'||c.phase==='media_wait')&&q.number===c.cursor||['repeat','submit'].includes(c.phase))&&!c.submitted);
  }
  const blocked=!canEdit(c,q,fromServer(q.id))||pending||(left===0&&['question','submit','repeat'].includes(c.phase));for(const input of card.querySelectorAll('input,textarea,select,button[type="submit"]'))input.disabled=blocked;}
 for(const button of document.querySelectorAll('[data-classic-control]'))button.disabled=pending||c.phase==='intro'&&!preflightReady||c.phase==='media_wait'&&left>0;
 for(const button of document.querySelectorAll('[data-classic-submit]'))button.disabled=pending||left===0;
}
setInterval(tick,250);
