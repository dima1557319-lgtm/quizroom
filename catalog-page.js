import {supabase} from './supabase-client.js';
import { quizzes as staticQuizzes, quizIds as staticIds } from './quiz-catalog.js?v=20261015-catalog30';
const $ = id => document.getElementById(id);
const make = (tag, className, text) => {const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const normalize = text => text.toLocaleLowerCase('ru').replaceAll('ё','е');
let quizzes=[],quizIds=[];
$('year').textContent=new Date().getFullYear();
$('catalogStatus').textContent='Загружаем каталог…';
let limit=12;
function filtered(){
 const words=normalize($('catalogSearch').value.trim()).split(/\s+/).filter(Boolean);
 return quizzes.map((q,i)=>({q,i})).filter(({q})=>(!$('catalogCategory').value||q.category===$('catalogCategory').value)&&(!$('catalogLevel').value||q.level===$('catalogLevel').value)&&words.every(word=>normalize(`${q.title} ${q.category} ${q.desc}`).includes(word)));
}
function renderCatalog(){
 const matches=filtered();
 const cards=matches.slice(0,limit).map(({q,i})=>{
  const card=make('article','card');
  const art=make('div','art',q.icon);art.setAttribute('aria-hidden','true');
  const body=make('div','card-body');
  body.append(make('div','meta',`${q.category.toLocaleUpperCase('ru')} · ${q.level} · ${q.question_count||q.questions.length} вопросов`),make('h3','',q.title),make('p','',q.desc));
  const bottom=make('div','bottom');const link=make('a','primary small','Играть вместе →');link.href=`./room-test.html?quiz=${quizIds[i]}`;link.setAttribute('aria-label',`Играть вместе: ${q.title}`);const price=Number(q.price||0);bottom.append(make('span','price',price?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(price):'Бесплатно'));
  if(q.available){bottom.append(link);}else{const unavailable=make('button','secondary small','Покупка пока недоступна');unavailable.disabled=true;bottom.append(unavailable);} 
  const demo=make('button','secondary small','Одиночное демо');demo.type='button';demo.style.marginTop='12px';demo.setAttribute('aria-label',`Одиночное демо: ${q.title}`);demo.addEventListener('click',()=>openGame(i,demo));body.append(bottom);if(!q.managed&&q.questions.length&&q.available)body.append(demo);if(!q.available)body.append(make('p','muted','Продажи ещё не подключены.'));card.append(art,body);return card;
 });
 $('cards').replaceChildren(...cards);
 $('catalogStatus').textContent=matches.length?`Показано ${cards.length} из ${matches.length}`:'Ничего не найдено. Попробуйте другую тему или запрос.';
 $('emptyCatalog').hidden=matches.length!==0;
 $('loadMore').hidden=matches.length<=limit;
 $('loadMore').textContent=`Показать ещё ${Math.min(12,Math.max(0,matches.length-limit))}`;
}
for(const id of ['catalogSearch','catalogCategory','catalogLevel'])$(id).addEventListener(id==='catalogSearch'?'input':'change',()=>{limit=12;renderCatalog();});
function resetFilters(){$('catalogSearch').value='';$('catalogCategory').value='';$('catalogLevel').value='';limit=12;renderCatalog();$('catalogSearch').focus();}
$('resetFilters').addEventListener('click',resetFilters);$('emptyReset').addEventListener('click',resetFilters);
$('loadMore').addEventListener('click',()=>{limit+=12;renderCatalog();});
async function loadCatalog(){
 try{
  const {data,error}=await supabase.rpc('list_quiz_catalog');if(error)throw error;
  if(!Array.isArray(data))throw Error('Неверный ответ каталога');
  quizIds=data.map(q=>q.key);quizzes=data.map(q=>{const index=staticIds.indexOf(q.key);return {...q,desc:q.description,questions:q.managed?[]:staticQuizzes[index]?.questions||[]};});
  const originalOrder=new Map(staticIds.map((id,i)=>[id,i]));const combined=quizzes.map((q,i)=>({q,id:quizIds[i]})).sort((a,b)=>(originalOrder.get(a.id)??1000)-(originalOrder.get(b.id)??1000));quizzes=combined.map(x=>x.q);quizIds=combined.map(x=>x.id);
  $('catalogCount').textContent=`Квизы: ${quizzes.length} · Вопросы: ${quizzes.reduce((n,q)=>n+q.question_count,0)}`;
  for(const category of [...new Set(quizzes.map(q=>q.category))].sort((a,b)=>a.localeCompare(b,'ru'))){const option=make('option','',category);option.value=category;$('catalogCategory').append(option);}renderCatalog();
 }catch{ $('catalogStatus').textContent='Не удалось загрузить каталог. Обновите страницу, чтобы узнать актуальные цены и доступность.';$('loadMore').hidden=true; }
}
void loadCatalog();
let active=0,index=0,score=0,answered=false,returnFocus;
function openGame(i,trigger){active=i;index=0;score=0;returnFocus=trigger;$('overlay').classList.add('open');document.body.style.overflow='hidden';renderQuestion();$('overlay').querySelector('.close').focus();}
function closeGame(){$('overlay').classList.remove('open');document.body.style.overflow='';if(returnFocus?.isConnected)returnFocus.focus();}
function renderQuestion(){
 const quiz=quizzes[active];$('gameName').textContent=`${quiz.icon} ${quiz.title}`;$('bar').style.width=`${index/quiz.questions.length*100}%`;
 const content=$('gameContent');content.replaceChildren();
 if(index>=quiz.questions.length){
  $('counter').textContent='Игра завершена';content.append(make('div','question',`🏆 Твой результат: ${score} из ${quiz.questions.length}`),make('p','muted',score===quiz.questions.length?'Идеальная игра!':score>=10?'Отличная работа!':'Попробуй ещё раз — получится лучше!'));
  const actions=make('div','hero-actions');const again=make('button','primary','Сыграть ещё раз');again.type='button';again.addEventListener('click',()=>openGame(active,returnFocus));const back=make('button','secondary','В каталог');back.type='button';back.addEventListener('click',closeGame);actions.append(again,back);content.append(actions);return;
 }
 answered=false;const item=quiz.questions[index];$('counter').textContent=`Вопрос ${index+1} из ${quiz.questions.length} · Очки: ${score}`;
 const answers=make('div','answers');const feedback=make('div','feedback');feedback.setAttribute('aria-live','polite');const next=make('button','primary',index===quiz.questions.length-1?'Показать результат':'Следующий вопрос →');next.type='button';next.hidden=true;next.style.marginTop='10px';next.addEventListener('click',()=>{index++;renderQuestion();});
 item.a.forEach((value,choice)=>{
  const button=make('button','answer',`${String.fromCharCode(65+choice)}. ${value}`);button.type='button';button.addEventListener('click',()=>{
   if(answered)return;answered=true;if(choice===item.correct)score++;
   [...answers.children].forEach((b,i)=>{b.disabled=true;if(i===item.correct)b.classList.add('correct');else if(i===choice)b.classList.add('wrong');});
   feedback.textContent=choice===item.correct?'✓ Правильно! +1 балл':'✕ Не совсем. Правильный ответ подсвечен зелёным.';next.hidden=false;
  });answers.append(button);
 });
 content.append(make('div','question',item.q),answers,feedback,next);
}
Object.assign(window,{closeGame});
document.addEventListener('keydown',event=>{
 if(!$('overlay').classList.contains('open'))return;
 if(event.key==='Escape'){closeGame();return;}
 if(event.key==='Tab'){
  const buttons=[...$('overlay').querySelectorAll('button:not(:disabled)')].filter(b=>!b.hidden);
  const first=buttons[0],last=buttons.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
try{
 $('resumeHost').hidden=!(sessionStorage.getItem('quizroom_role')!=='player'&&!sessionStorage.getItem('quizroom_player_secret')&&sessionStorage.getItem('quizroom_room_code')&&sessionStorage.getItem('quizroom_host_secret'));
 $('resumePlayer').hidden=!(sessionStorage.getItem('quizroom_player_id')&&sessionStorage.getItem('quizroom_player_secret'));
}catch{}
