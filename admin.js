import {adminClient as api} from './admin-client.js?v=studio1';
import {renderMedia} from './quiz-media.js?v=studio1';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
let records=[],current=null,doc=null,dirty=false,generation=0,busy=false;
const blankQuestion=()=>({text:'',kind:'single',options:['','','',''],correct:[0],accepted:[],points:1,duration:30,partial:false,case_sensitive:false,explanation:'',animation:'none'});
const blank=()=>({title:'Новый квиз',description:'',category:'Общие знания',icon:'🧩',level:'Лёгкий',price:0,score_timing:'question',reveal_timing:'question',rounds:[{title:'Тур 1',questions:[blankQuestion()]}]});
function status(text){$('adminStatus').textContent=text;}
function changed(){dirty=true;generation++;$('saveState').textContent='Есть несохранённые изменения';}
function button(text,action,parent){const b=node('button',text);b.type='button';b.className='secondary';b.addEventListener('click',action);parent.append(b);return b;}
function field(parent,title,value,onChange,type='text'){
 const label=node('label',title);const input=node(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';input.addEventListener('input',()=>{onChange(input.value);changed();});label.append(input);parent.append(label);return input;
}
function select(parent,title,value,options,onChange){const label=node('label',title);const e=node('select');for(const [v,t]of options){const o=node('option',t);o.value=v;e.append(o);}e.value=value;e.addEventListener('change',()=>{onChange(e.value);changed();});label.append(e);parent.append(label);return e;}
function check(parent,title,value,onChange){const label=node('label');label.className='inline-check';const c=node('input');c.type='checkbox';c.checked=!!value;c.addEventListener('change',()=>{onChange(c.checked);changed();});label.append(c,node('span',title));parent.append(label);}
function move(array,index,delta){if(index+delta<0||index+delta>=array.length)return;[array[index],array[index+delta]]=[array[index+delta],array[index]];changed();renderRounds();}
function mediaFields(parent,title,q,key){
 const wrap=node('details');wrap.append(node('summary',title));parent.append(wrap);
 const value=q[key]||{type:'image',url:'',alt:''};
 const commit=()=>{q[key]=value.url.trim()?{...value,url:value.url.trim()}:null;};
 select(wrap,'Тип медиа',value.type,[['image','Изображение / GIF'],['audio','Аудио'],['video','Видео']],v=>{value.type=v;commit();});
 field(wrap,'HTTPS-ссылка',value.url,v=>{value.url=v;commit();});field(wrap,'Описание изображения',value.alt,v=>{value.alt=v;commit();});
 const upload=node('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/ogg,video/mp4,video/webm';const label=node('label','Загрузить файл (до 20 МБ)');label.append(upload);wrap.append(label,node('small','Загружайте медиа для показа участникам. Файлы доступны по прямой ссылке.'));
 upload.addEventListener('change',async()=>{
  const file=upload.files?.[0];if(!file)return;
  const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','audio/mpeg':'mp3','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm'};
  if(!types[file.type]||file.size>20*1024*1024){status('Поддерживаются JPG, PNG, WebP, GIF, MP3, OGG, MP4 и WebM до 20 МБ.');return;}
  upload.disabled=true;status('Загружаем медиа…');
  try{const path=`${crypto.randomUUID()}.${types[file.type]}`;const {error}=await api.storage.from('quiz-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;const {data}=api.storage.from('quiz-media').getPublicUrl(path);q[key]={url:data.publicUrl,type:file.type.split('/')[0],alt:value.alt};changed();renderRounds();status('Медиа загружено. Сохраните черновик.');}catch(e){status(e.message);}finally{upload.disabled=false;}
 });
}
function renderRounds(){
 $('roundEditor').replaceChildren();
 doc.rounds.forEach((round,ri)=>{
  const section=node('fieldset');section.append(node('legend',`Тур ${ri+1}`));field(section,'Название тура',round.title,v=>round.title=v);
  const actions=node('div');actions.className='actions';button('Тур выше',()=>move(doc.rounds,ri,-1),actions);button('Тур ниже',()=>move(doc.rounds,ri,1),actions);button('Удалить тур',()=>{if(confirm('Удалить этот тур из черновика?')){doc.rounds.splice(ri,1);changed();renderRounds();}},actions);section.append(actions);
  round.questions.forEach((q,qi)=>{
   const card=node('fieldset');card.className='question-card';card.append(node('legend',`Вопрос ${qi+1}`));
   const qa=node('div');qa.className='actions';button('Вопрос выше',()=>move(round.questions,qi,-1),qa);button('Вопрос ниже',()=>move(round.questions,qi,1),qa);button('Удалить вопрос',()=>{round.questions.splice(qi,1);changed();renderRounds();},qa);card.append(qa);
   field(card,'Текст вопроса',q.text,v=>q.text=v,'textarea').maxLength=500;
   select(card,'Тип ответа',q.kind,[['single','Один вариант'],['multiple','Несколько вариантов'],['text','Текст с автоматической проверкой'],['manual','Текст с оценкой ведущим']],v=>{q.kind=v;if(v==='single')q.correct=[q.correct?.[0]??0];if(!q.options?.length)q.options=['',''];renderRounds();});
   if(['single','multiple'].includes(q.kind)){
    card.append(node('p','Отметьте правильные варианты. Их увидят только администраторы и участники после раскрытия ответа.'));
    q.options.forEach((option,oi)=>{const row=node('div');row.className='option-row';const mark=node('input');mark.type=q.kind==='single'?'radio':'checkbox';mark.name=`correct-${ri}-${qi}`;mark.checked=(q.correct||[]).includes(oi);mark.setAttribute('aria-label',`Вариант ${oi+1} правильный`);mark.addEventListener('change',()=>{q.correct=q.kind==='single'?[oi]:mark.checked?[...(q.correct||[]),oi]:(q.correct||[]).filter(x=>x!==oi);changed();});const text=node('input');text.value=option;text.maxLength=200;text.setAttribute('aria-label',`Вариант ${oi+1}`);text.addEventListener('input',()=>{q.options[oi]=text.value;changed();});row.append(mark,text);button('Убрать',()=>{if(q.options.length<=2)return;q.options.splice(oi,1);q.correct=(q.correct||[]).filter(x=>x!==oi).map(x=>x>oi?x-1:x);changed();renderRounds();},row);card.append(row);});
    button('Добавить вариант',()=>{if(q.options.length<8){q.options.push('');changed();renderRounds();}},card);
    if(q.kind==='multiple'){check(card,'Частичные баллы: (верные выбранные − лишние) / число верных',q.partial,v=>q.partial=v);card.append(node('small','Минимум 0, максимум — стоимость вопроса. Без этой настройки баллы начисляются только за точный набор.'));}
   }
   if(q.kind==='text'){field(card,'Допустимые ответы — по одному на строку',(q.accepted||[]).join('\n'),v=>q.accepted=v.split('\n').filter(x=>x.trim()),'textarea');check(card,'Учитывать регистр',q.case_sensitive,v=>q.case_sensitive=v);card.append(node('small','Без учёта регистра: «ё» и «е» равнозначны; лишние пробелы убираются.'));}
   if(q.kind==='manual')card.append(node('p','Игрок вводит текст. Ведущий оценивает его от 0 до стоимости вопроса, до перехода дальше.'));
   const config=node('div');config.className='fields';field(config,'Баллы за правильный ответ',q.points,v=>q.points=decimal(v));field(config,'Время на ответ, секунд',q.duration,v=>q.duration=Number(v),'number');card.append(config);
   mediaFields(card,'Медиа в вопросе',q,'media');mediaFields(card,'Медиа при раскрытии ответа',q,'answer_media');
   select(card,'Появление вопроса',q.animation||'none',[['none','Без анимации'],['fade','Плавное появление']],v=>q.animation=v);
   field(card,'Пояснение к ответу',q.explanation,v=>q.explanation=v,'textarea').maxLength=2000;section.append(card);
  });
  button('Добавить вопрос',()=>{if(doc.rounds.reduce((n,r)=>n+r.questions.length,0)>=50){status('Максимум 50 вопросов.');return;}round.questions.push(blankQuestion());changed();renderRounds();},section);$('roundEditor').append(section);
 });
}
function decimal(v){const text=String(v).trim().replace(',','.');return /^\d+(\.\d{1,2})?$/.test(text)?Number(text):text;}
function documentValue(){return {...doc,title:$('quizTitle').value.trim(),category:$('quizCategory').value.trim(),icon:$('quizIcon').value||'🧩',level:$('quizLevel').value,description:$('quizDescription').value.trim(),price:decimal($('quizPrice').value),score_timing:$('scoreTiming').value,reveal_timing:$('revealTiming').value};}
function open(record){
 if(dirty&&!confirm('Открыть другой квиз без сохранения изменений?'))return;
 current=record;doc=structuredClone(record?.draft||blank());dirty=false;generation++;
 for(const [id,key]of [['quizTitle','title'],['quizCategory','category'],['quizIcon','icon'],['quizLevel','level'],['quizDescription','description'],['quizPrice','price'],['scoreTiming','score_timing'],['revealTiming','reveal_timing']])$(id).value=doc[key]??'';
 $('editor').hidden=false;$('saveState').textContent=record?`Черновик: версия ${record.revision}${record.published_revision?' · опубликована версия '+record.published_revision:''}`:'Новый квиз ещё не сохранён';renderRounds();
 $('editor').scrollIntoView({block:'start',behavior:'instant'});
 $('quizTitle').focus({preventScroll:true});
}
async function rpc(name,args){const {data,error}=await api.rpc(name,args);if(error)throw error;return data;}
async function list(){records=await rpc('admin_list_quizzes');$('quizList').replaceChildren();for(const r of records){button(`${r.draft.title||'Без названия'} · ${r.published_revision?'опубликован':'черновик'}`,()=>open(r),$('quizList'));}}
async function save(){
 const version=generation;const saved=await rpc('admin_save_quiz',{p_id:current?.id||null,p_document:documentValue(),p_revision:current?.revision||0});current=saved;
 if(generation===version){doc=structuredClone(saved.draft);dirty=false;$('saveState').textContent=`Черновик сохранён · версия ${saved.revision}`;}else $('saveState').textContent='Есть новые несохранённые изменения';await list();return saved;
}
async function action(fn){if(busy)return;busy=true;for(const id of ['saveQuiz','publishQuiz','unpublishQuiz','launchQuiz','newQuiz','reloadQuizzes'])$(id).disabled=true;status('');try{await fn();}catch(e){status(e.message||'Не удалось выполнить действие');}finally{busy=false;for(const id of ['saveQuiz','publishQuiz','unpublishQuiz','launchQuiz','newQuiz','reloadQuizzes'])$(id).disabled=false;}}
$('newQuiz').addEventListener('click',()=>open(null));$('reloadQuizzes').addEventListener('click',()=>action(list));$('saveQuiz').addEventListener('click',()=>action(async()=>{await save();status('Черновик сохранён.');}));
$('publishQuiz').addEventListener('click',()=>action(async()=>{const saved=await save();if(dirty)throw Error('Сохраните новые изменения перед публикацией.');await rpc('admin_publish_quiz',{p_id:saved.id,p_revision:saved.revision});current.published_revision=current.revision;await list();status('Квиз опубликован. Цена и правила обновлены в каталоге.');}));
$('unpublishQuiz').addEventListener('click',()=>action(async()=>{if(!current)return;await rpc('admin_unpublish_quiz',{p_id:current.id});await list();current.published_revision=null;status('Квиз снят с публикации. Черновик сохранён.');}));
$('launchQuiz').addEventListener('click',()=>action(async()=>{if(!current?.published_revision||current.published_revision!==current.revision||dirty)throw Error('Сначала сохраните и опубликуйте квиз.');const data=await rpc('create_quiz_room_v2',{p_quiz_key:current.template_key});const r=data[0];sessionStorage.setItem('quizroom_room_code',r.room_code);sessionStorage.setItem('quizroom_host_secret',r.host_secret);sessionStorage.setItem('quizroom_role','host');for(const key of ['quizroom_player_id','quizroom_player_secret','quizroom_player_room'])sessionStorage.removeItem(key);location.assign('./host.html');}));
$('addRound').addEventListener('click',()=>{if(doc.rounds.length<20){doc.rounds.push({title:`Тур ${doc.rounds.length+1}`,questions:[blankQuestion()]});changed();renderRounds();}});
for(const id of ['quizTitle','quizCategory','quizIcon','quizLevel','quizDescription','quizPrice','scoreTiming','revealTiming'])$(id).addEventListener('input',changed);
$('previewQuiz').addEventListener('click',()=>{
 const data=documentValue();$('previewTitle').textContent=data.title;$('previewContent').replaceChildren();
 for(const round of data.rounds){$('previewContent').append(node('h3',round.title));for(const q of round.questions){const c=node('section');c.className='preview-question';c.append(node('h4',q.text),node('p',`Баллы: ${q.points} · Время: ${q.duration} сек.`));const media=node('div');renderMedia(q.media,media);c.append(media);if(['single','multiple'].includes(q.kind)){const ol=node('ol');q.options.forEach((o,i)=>ol.append(node('li',`${o}${q.correct?.includes(i)?' ✓':''}`)));c.append(ol);}else c.append(node('p',q.kind==='manual'?'Проверяет ведущий':`Допустимые ответы: ${(q.accepted||[]).join('; ')}`));c.append(node('p',q.explanation));const answer=node('div');renderMedia(q.answer_media,answer);c.append(answer);$('previewContent').append(c);}}
 $('preview').showModal();
});
async function session(){const {data}=await api.auth.getSession();if(!data.session)return;const allowed=await rpc('is_quiz_admin');if(!allowed){status('Учётная запись не имеет прав администратора.');await api.auth.signOut();return;}$('authPanel').hidden=true;$('studio').hidden=false;await list();}
$('loginForm').addEventListener('submit',e=>{e.preventDefault();void action(async()=>{const {error}=await api.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});$('adminPassword').value='';if(error)throw error;await session();});});
$('logout').addEventListener('click',()=>action(async()=>{if(dirty&&!confirm('Выйти без сохранения?'))return;await api.auth.signOut();location.reload();}));
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
session().catch(e=>status(e.message));

$('registerAdmin').addEventListener('click',()=>action(async()=>{if(!$('loginForm').reportValidity())return;const {error}=await api.auth.signUp({email:$('adminEmail').value.trim(),password:$('adminPassword').value,options:{emailRedirectTo:new URL('./admin.html',location.href).href}});$('adminPassword').value='';if(error)throw error;status('Подтвердите email по письму, затем вернитесь сюда и войдите. Доступ получат только разрешённые адреса.');}));
