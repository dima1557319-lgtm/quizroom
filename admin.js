import {validateQuiz,importQuiz,countQuestions} from './studio-document.js?v=classic3';
import {isClassic,classicTemplate,roundRules,rulesText} from './classic-document.js?v=classic3';
import {editRoundRules} from './classic-editor.js?v=classic3';
import {downloadFile} from './game-files.js?v=play2';
import './admin-banners.js?v=digest1';
import {adminClient as api} from './admin-client.js?v=studio1';
import {renderMedia} from './quiz-media.js?v=studio1';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
let records=[],current=null,doc=null,dirty=false,generation=0,busy=false;
let autoTimer,backupKey=null,backupBase=null,backupPrefix=null,recoveryKey=null,recoveredKey=null,recovery=null,conflict=false,uncertainCreate=false,uploads=0;
let history=[];let expanded=new WeakSet();let allExpanded=true;let collapsed=new WeakSet();
const blankQuestion=()=>({text:'',kind:'single',options:['','','',''],correct:[0],accepted:[],points:1,duration:30,partial:false,case_sensitive:false,explanation:'',animation:'none'});
const blank=()=>({title:'Новый квиз',description:'',category:'Общие знания',icon:'🧩',level:'Лёгкий',price:0,score_timing:'question',reveal_timing:'question',rounds:[{title:'Тур 1',questions:[blankQuestion()]}]});
function status(text){$('adminStatus').textContent=text;}
function changed(structure=false){if(structure!==true&&history.length){history=[];$('undoEdit').disabled=true;}dirty=true;generation++;$('saveState').textContent='Есть несохранённые изменения';remember();stats();scheduleSave();}
function scheduleSave(){clearTimeout(autoTimer);if(!$('autoSave').checked||conflict||!dirty)return;autoTimer=setTimeout(()=>{if(busy||uploads){scheduleSave();return;}void action(async()=>{await save();});},2000);}
function remember(){if(!backupKey||!doc)return;try{const backup={uncertain_create:uncertainCreate,record:current?{id:current.id,revision:current.revision,template_key:current.template_key,published_revision:current.published_revision}:null,document:documentValue(),saved_at:new Date().toISOString()};localStorage.setItem(backupKey,JSON.stringify(backup));}catch{$('saveState').textContent+=' · Не удалось сохранить резервную копию в браузере: скачайте JSON';}}
function stats(){if(!doc)return;doc.rounds.forEach((r,ri)=>r.questions.forEach((q,qi)=>{const fold=$(`question-${ri}-${qi}`);if(fold)fold.querySelector('summary').textContent=`Вопрос ${qi+1} · ${q.text||'Без текста'}`;}));const qs=doc.rounds.flatMap(r=>r.questions);$('quizStats').textContent=`Туров: ${doc.rounds.length} / 20 · Вопросов: ${qs.length} / 50 · Баллов: ${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(qs.reduce((n,q)=>n+(Number(q.points)||0),0))} · Время ответов: ${Math.ceil(qs.reduce((n,q)=>n+(Number(q.duration)||0),0)/60)} мин (без разбора)`;}
function structural(fn){history.push(structuredClone(documentValue()));if(history.length>10)history.shift();fn();changed(true);renderRounds();$('undoEdit').disabled=false;}
async function leave(){clearTimeout(autoTimer);if(!dirty)return true;const dialog=$('leaveConfirm');dialog.returnValue='';const response=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));dialog.showModal();const choice=await response;if(choice==='save'){try{await action(async()=>{await save();});return !dirty;}catch{return false;}}return choice==='discard';}
function refreshBackupNotice(){try{const copies=Object.keys(localStorage).filter(k=>k.startsWith(backupPrefix)).map(k=>({key:k,value:JSON.parse(localStorage.getItem(k))})).filter(item=>item.value?.document).sort((a,b)=>b.value.saved_at.localeCompare(a.value.saved_at));recovery=copies[0]?.value||null;recoveryKey=copies[0]?.key||null;}catch{recovery=null;}$('backupNotice').hidden=!recovery;if(recovery)$('backupText').textContent=`Сохранена резервная копия «${recovery.document?.title||'Без названия'}» от ${new Date(recovery.saved_at).toLocaleString('ru-RU')}. Она может содержать правки, не попавшие на сервер.`;}

function button(text,action,parent){const b=node('button',text);b.type='button';b.className='secondary';b.addEventListener('click',action);parent.append(b);return b;}
function field(parent,title,value,onChange,type='text'){
 const label=node('label',title);const input=node(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';input.addEventListener('input',()=>{onChange(input.value);changed();});label.append(input);parent.append(label);return input;
}
function select(parent,title,value,options,onChange){const label=node('label',title);const e=node('select');for(const [v,t]of options){const o=node('option',t);o.value=v;e.append(o);}e.value=value;e.addEventListener('change',()=>{onChange(e.value);changed();});label.append(e);parent.append(label);return e;}
function check(parent,title,value,onChange){const label=node('label');label.className='inline-check';const c=node('input');c.type='checkbox';c.checked=!!value;c.addEventListener('change',()=>{onChange(c.checked);changed();});label.append(c,node('span',title));parent.append(label);}
function move(array,index,delta){if(index+delta<0||index+delta>=array.length)return;structural(()=>{[array[index],array[index+delta]]=[array[index+delta],array[index]];});}
function mediaFields(parent,title,q,key){
 const targetDoc=doc;const wrap=node('details');wrap.append(node('summary',title));parent.append(wrap);
 const value=q[key]||{type:'image',url:'',alt:''};
 const commit=()=>{q[key]=value.url.trim()?{...value,url:value.url.trim()}:null;};
 select(wrap,'Тип медиа',value.type,[['image','Изображение / GIF'],['audio','Аудио'],['video','Видео']],v=>{value.type=v;commit();});
 field(wrap,'HTTPS-ссылка',value.url,v=>{value.url=v;commit();});field(wrap,'Описание изображения',value.alt,v=>{value.alt=v;commit();});
 const preview=node('div');renderMedia(q[key],preview);wrap.append(preview);button('Обновить просмотр медиа',()=>renderMedia(q[key],preview),wrap);button('Убрать медиа',()=>{q[key]=null;value.url='';changed();renderRounds();},wrap);
 const upload=node('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/ogg,video/mp4,video/webm';const label=node('label','Загрузить файл (до 20 МБ)');label.append(upload);wrap.append(label,node('small','Загружайте медиа для показа участникам. Файлы доступны по прямой ссылке.'));
 upload.addEventListener('change',async()=>{
  const file=upload.files?.[0];if(!file)return;
  const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','audio/mpeg':'mp3','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm'};
  if(!types[file.type]||file.size>20*1024*1024){status('Поддерживаются JPG, PNG, WebP, GIF, MP3, OGG, MP4 и WebM до 20 МБ.');return;}
  upload.disabled=true;uploads++;status('Загружаем медиа…');
  try{const path=`${crypto.randomUUID()}.${types[file.type]}`;const {error}=await api.storage.from('quiz-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;const {data}=api.storage.from('quiz-media').getPublicUrl(path);if(doc!==targetDoc||!doc.rounds.some(r=>r.questions.includes(q))){status('Вопрос был переключён или удалён. Выберите медиа заново.');return;}q[key]={url:data.publicUrl,type:file.type.split('/')[0],alt:value.alt};changed();renderRounds();status('Медиа загружено. Сохраните черновик.');}catch(e){status(e.message);}finally{upload.disabled=false;uploads--;}
 });
}
function renderRounds(){
 if(isClassic(doc)){const ids=new Set();for(const r of doc.rounds)for(const item of [r,...r.questions]){if(!item.id||ids.has(item.id))item.id=crypto.randomUUID();ids.add(item.id);}}
 $('classicRanking').hidden=!isClassic(doc);for(const id of ['scoreTiming','revealTiming'])$(id).closest('label').hidden=isClassic(doc);$('quizFormatLabel').textContent=isClassic(doc)?'Многораундовая игра · общий бланк, правила туров и ставки':'Простой квиз · прежний формат вопросов';
 $('roundEditor').replaceChildren();$('questionOutline').replaceChildren();stats();
 doc.rounds.forEach((round,ri)=>{
  const section=node('fieldset');section.append(node('legend',`Тур ${ri+1}`));field(section,'Название тура',round.title,v=>round.title=v).id=`round-${ri}-title`;section.id=`round-${ri}`;
  if(isClassic(doc))editRoundRules(section,round,{field,select,check,refresh:renderRounds});
  const actions=node('div');actions.className='actions';button('Тур выше',()=>move(doc.rounds,ri,-1),actions).disabled=ri===0;button('Тур ниже',()=>move(doc.rounds,ri,1),actions).disabled=ri===doc.rounds.length-1;button('Копировать тур',()=>{if(doc.rounds.length>=20||countQuestions(doc)+round.questions.length>50){status('Лимит: 20 туров и 50 вопросов.');return;}structural(()=>doc.rounds.splice(ri+1,0,structuredClone(round)));},actions);button('Удалить тур',()=>structural(()=>doc.rounds.splice(ri,1)),actions);section.append(actions);
  round.questions.forEach((q,qi)=>{
   const fold=node('details');fold.className='question-fold';fold.id=`question-${ri}-${qi}`;fold.open=!collapsed.has(q);fold.addEventListener('toggle',()=>{if(fold.open){expanded.add(q);collapsed.delete(q);}else{expanded.delete(q);collapsed.add(q);}});const summary=node('summary',`Вопрос ${qi+1} · ${q.text||'Без текста'}`);fold.append(summary);const card=node('fieldset');card.className='question-card';card.append(node('legend',`Вопрос ${qi+1}`));
   button(`${ri+1}.${qi+1} ${q.text||'Без текста'}`,()=>{fold.open=true;fold.scrollIntoView({block:'start',behavior:'smooth'});},$('questionOutline'));
   const qa=node('div');qa.className='actions';button('Вопрос выше',()=>move(round.questions,qi,-1),qa).disabled=qi===0;button('Вопрос ниже',()=>move(round.questions,qi,1),qa).disabled=qi===round.questions.length-1;button('Копировать вопрос',()=>{if(countQuestions(doc)>=50){status('Максимум 50 вопросов.');return;}structural(()=>round.questions.splice(qi+1,0,structuredClone(q)));},qa);button('Удалить вопрос',()=>structural(()=>round.questions.splice(qi,1)),qa);
   if(doc.rounds.length>1){const label=node('label','Перенести в тур');const chooser=node('select');chooser.setAttribute('aria-label',`Перенести вопрос ${qi+1} из тура ${ri+1}`);doc.rounds.forEach((r,i)=>{const o=node('option',`${i+1}. ${r.title}`);o.value=i;chooser.append(o);});chooser.value=ri;chooser.addEventListener('change',()=>{const destination=Number(chooser.value);if(destination!==ri)structural(()=>{round.questions.splice(qi,1);doc.rounds[destination].questions.push(q);});});label.append(chooser);qa.append(label);}card.append(qa);
   const questionText=field(card,'Текст вопроса',q.text,v=>q.text=v,'textarea');questionText.maxLength=500;questionText.id=`question-${ri}-${qi}-text`;
   select(card,'Тип ответа',q.kind,[['single','Один вариант'],['multiple','Несколько вариантов'],['text','Текст с автоматической проверкой'],['manual','Текст с оценкой ведущим']],v=>{q.kind=v;if(v==='single')q.correct=[q.correct?.[0]??0];if(!q.options?.length)q.options=['',''];renderRounds();});
   if(['single','multiple'].includes(q.kind)){
    card.append(node('p','Отметьте правильные варианты. Их увидят только администраторы и участники после раскрытия ответа.'));
    q.options.forEach((option,oi)=>{const row=node('div');row.className='option-row';const mark=node('input');mark.type=q.kind==='single'?'radio':'checkbox';mark.name=`correct-${ri}-${qi}`;mark.checked=(q.correct||[]).includes(oi);mark.setAttribute('aria-label',`Вариант ${oi+1} правильный`);mark.addEventListener('change',()=>{q.correct=q.kind==='single'?[oi]:mark.checked?[...(q.correct||[]),oi]:(q.correct||[]).filter(x=>x!==oi);changed();});const text=node('input');text.value=option;text.maxLength=200;text.setAttribute('aria-label',`Вариант ${oi+1}`);text.addEventListener('input',()=>{q.options[oi]=text.value;changed();});row.append(mark,text);button('Убрать',()=>{if(q.options.length<=2)return;structural(()=>{q.options.splice(oi,1);q.correct=(q.correct||[]).filter(x=>x!==oi).map(x=>x>oi?x-1:x);});},row).disabled=q.options.length<=2;card.append(row);});
    button('Добавить вариант',()=>{if(q.options.length<8)structural(()=>q.options.push(''));},card).disabled=q.options.length>=8;
    if(q.kind==='multiple'){check(card,'Частичные баллы: (верные выбранные − лишние) / число верных',q.partial,v=>q.partial=v);card.append(node('small','Минимум 0, максимум — стоимость вопроса. Без этой настройки баллы начисляются только за точный набор.'));}
   }
   if(q.kind==='text'){field(card,'Допустимые ответы — по одному на строку',(q.accepted||[]).join('\n'),v=>q.accepted=v.split('\n').filter(x=>x.trim()),'textarea');check(card,'Учитывать регистр',q.case_sensitive,v=>q.case_sensitive=v);card.append(node('small','Без учёта регистра: «ё» и «е» равнозначны; лишние пробелы убираются.'));}
   if(q.kind==='manual')card.append(node('p','Игрок вводит текст. Ведущий оценивает его от 0 до стоимости вопроса, до перехода дальше.'));
   const config=node('div');config.className='fields';field(config,'Баллы за правильный ответ',q.points,v=>q.points=decimal(v)).inputMode='decimal';const duration=field(config,'Время на ответ, секунд',q.duration,v=>q.duration=Number(v),'number');duration.min=5;duration.max=300;duration.step=1;card.append(config);
   mediaFields(card,'Медиа в вопросе',q,'media');mediaFields(card,'Медиа при раскрытии ответа',q,'answer_media');
   if(isClassic(doc)){select(card,'Сложность вопроса',q.difficulty||'Средний',[['Лёгкий','Лёгкий'],['Средний','Средний'],['Сложный','Сложный']],v=>q.difficulty=v);for(const [key,label]of [['media_start','Начало аудио/видео, секунд'],['media_end','Конец аудио/видео, секунд']])field(card,label,q[key],v=>{if(v==='')delete q[key];else q[key]=Number(v);},'number');}
   select(card,'Появление вопроса',q.animation||'none',[['none','Без анимации'],['fade','Плавное появление']],v=>q.animation=v);
   field(card,'Пояснение к ответу',q.explanation,v=>q.explanation=v,'textarea').maxLength=2000;fold.append(card);section.append(fold);
  });
  button('Добавить вопрос',()=>{if(doc.rounds.reduce((n,r)=>n+r.questions.length,0)>=50){status('Максимум 50 вопросов.');return;}structural(()=>round.questions.push(blankQuestion()));},section);$('roundEditor').append(section);
 });
}
function decimal(v){const text=String(v).trim().replace(',','.');return /^\d+(\.\d{1,2})?$/.test(text)?Number(text):text;}
function documentValue(){return {...doc,...(isClassic(doc)?{tie_break:$('tieBreak').value}:{}),rounds:doc.rounds.map(r=>({...r,questions:r.questions.map(q=>({...q,options:['single','multiple'].includes(q.kind)?q.options:[],correct:['single','multiple'].includes(q.kind)?q.correct:[],accepted:q.kind==='text'?q.accepted:[]}))})),title:$('quizTitle').value.trim(),category:$('quizCategory').value.trim(),icon:$('quizIcon').value||'🧩',level:$('quizLevel').value,description:$('quizDescription').value.trim(),price:decimal($('quizPrice').value),score_timing:$('scoreTiming').value,reveal_timing:$('revealTiming').value};}
async function open(record,force=false,replacement=null){
 if(busy||uploads){status('Дождитесь завершения сохранения или загрузки.');return;}if(!force&&!await leave())return;clearTimeout(autoTimer);recoveredKey=null;if(backupBase)backupKey=backupBase+crypto.randomUUID();history=[];$('undoEdit').disabled=true;conflict=false;uncertainCreate=false;
 current=record;doc=structuredClone(record?.draft||replacement||blank());$('tieBreak').value=doc.tie_break||'reverse_rounds';dirty=false;generation++;
 for(const [id,key]of [['quizTitle','title'],['quizCategory','category'],['quizIcon','icon'],['quizLevel','level'],['quizDescription','description'],['quizPrice','price'],['scoreTiming','score_timing'],['revealTiming','reveal_timing']])$(id).value=doc[key]??'';
 $('validationPanel').hidden=true;$('editor').hidden=false;$('saveState').textContent=record?`Черновик: версия ${record.revision}${record.published_revision?' · опубликована версия '+record.published_revision:''}`:'Новый квиз ещё не сохранён';renderRounds();renderCover();
 $('editor').scrollIntoView({block:'start',behavior:'instant'});
 $('quizTitle').focus({preventScroll:true});
}
async function rpc(name,args){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);try{let request=api.rpc(name,args);if(request.abortSignal)request=request.abortSignal(controller.signal);const {data,error}=await request;if(controller.signal.aborted)throw Error('Сервер не ответил вовремя. Правки сохранены локально. Обновите список перед повторным сохранением.');if(error)throw error;return data;}finally{clearTimeout(timer);}}
async function list(){
 records=await rpc('admin_list_quizzes');renderList();}
function renderList(){const search=$('quizSearch').value.trim().toLocaleLowerCase('ru');const filter=$('quizFilter').value;const visible=records.filter(r=>(!search||`${r.draft.title} ${r.draft.category||''}`.toLocaleLowerCase('ru').includes(search))&&(filter==='all'||filter==='draft'&&!r.published_revision||filter==='published'&&r.published_revision||filter==='changed'&&r.published_revision&&r.published_revision!==r.revision));$('listCount').textContent=`Найдено: ${visible.length} из ${records.length}`;$('quizList').replaceChildren();
 for(const r of visible){const row=node('article');row.className='quiz-list-item';row.append(node('strong',r.draft.title||'Без названия'),node('small',r.published_revision?(r.published_revision===r.revision?'В каталоге · без неопубликованных правок':'В каталоге · есть неопубликованные правки'):'Не опубликован'));
 const edit=button('Редактировать',()=>{if(!busy)open(r);},row);edit.setAttribute('aria-label',`Редактировать «${r.draft.title||'Без названия'}»`);$('quizList').append(row);}
}
async function save(){
 clearTimeout(autoTimer);if(uncertainCreate)throw Error('Создание черновика не подтверждено. Обновите список и откройте созданную запись, если она появилась; либо явно выберите «Сохранить как новый квиз».');if(uploads)throw Error('Дождитесь завершения загрузки медиа.');const version=generation;const newRecord=!current?.id;let saved;try{saved=await rpc('admin_save_quiz',{p_id:current?.id||null,p_document:documentValue(),p_revision:current?.revision||0});}catch(e){if(newRecord){uncertainCreate=true;conflict=true;remember();throw Error('Не удалось подтвердить создание черновика. Правки сохранены локально. Обновите список: запрос мог выполниться на сервере. Автосохранение остановлено, чтобы не создать дубликат.');}throw e;}current=saved;
 if(generation===version){dirty=false;conflict=false;try{if(backupKey)localStorage.removeItem(backupKey);if(recoveredKey){localStorage.removeItem(recoveredKey);recoveredKey=null;}}catch{}$('backupNotice').hidden=true;$('saveState').textContent=`Черновик сохранён в ${new Date().toLocaleTimeString('ru-RU')} · версия ${saved.revision}${saved.published_revision?' · в каталоге версия '+saved.published_revision:''}`;}else{remember();$('saveState').textContent='Есть новые несохранённые изменения';scheduleSave();}await list();return saved;
}
async function action(fn){if(busy)return;busy=true;for(const id of ['saveQuiz','publishQuiz','unpublishQuiz','deleteQuiz','launchQuiz','newQuiz','reloadQuizzes'])$(id).disabled=true;status('');try{await fn();}catch(e){if(e.code==='40001'){conflict=true;clearTimeout(autoTimer);status('Версия на сервере изменилась. Ваши правки сохранены локально. Скачайте JSON-копию или сохраните как новый квиз; для исходного квиза обновите список и откройте актуальную версию.');}else status(e.message||'Не удалось выполнить действие');}finally{busy=false;for(const id of ['saveQuiz','publishQuiz','unpublishQuiz','deleteQuiz','launchQuiz','newQuiz','reloadQuizzes'])$(id).disabled=false;}}
$('tieBreak').addEventListener('change',changed);$('newQuiz').addEventListener('click',()=>open(null));$('newClassicQuiz').addEventListener('click',()=>open(null,false,classicTemplate(true)));$('newClassicBlank').addEventListener('click',()=>open(null,false,classicTemplate(false)));$('reloadQuizzes').addEventListener('click',()=>action(list));$('saveQuiz').addEventListener('click',()=>action(async()=>{await save();status('Черновик сохранён.');}));
$('publishQuiz').addEventListener('click',()=>action(async()=>{if(!showValidation())throw Error('Исправьте отмеченные ошибки перед публикацией.');const saved=await save();if(dirty)throw Error('Сохраните новые изменения перед публикацией.');await rpc('admin_publish_quiz',{p_id:saved.id,p_revision:saved.revision});current.published_revision=current.revision;$('saveState').textContent=`В каталоге · версия ${current.revision}`;await list();status('Квиз опубликован. Цена и правила обновлены в каталоге.');}));
$('unpublishQuiz').addEventListener('click',()=>action(async()=>{if(!current)return;await rpc('admin_unpublish_quiz',{p_id:current.id});await list();current.published_revision=null;status('Квиз убран из каталога. Он сохранён в разделе «Мои квизы», и его можно опубликовать снова.');}));
$('launchQuiz').addEventListener('click',()=>action(async()=>{if(!current?.published_revision||current.published_revision!==current.revision||dirty)throw Error('Сначала сохраните и опубликуйте квиз.');if(isClassic(doc)){location.assign('./room-test.html?quiz='+encodeURIComponent(current.template_key));return;}const data=await rpc('create_quiz_room_v2',{p_quiz_key:current.template_key});const r=data[0];sessionStorage.setItem('quizroom_room_code',r.room_code);sessionStorage.setItem('quizroom_host_secret',r.host_secret);sessionStorage.setItem('quizroom_role','host');for(const key of ['quizroom_player_id','quizroom_player_secret','quizroom_player_room'])sessionStorage.removeItem(key);location.assign('./host.html');}));
$('addRound').addEventListener('click',()=>{if(doc.rounds.length>=20||countQuestions(doc)>=50){status('Лимит: 20 туров и 50 вопросов.');return;}structural(()=>doc.rounds.push({title:`Тур ${doc.rounds.length+1}`,questions:[blankQuestion()]}));});
for(const id of ['quizTitle','quizCategory','quizIcon','quizLevel','quizDescription','quizPrice','scoreTiming','revealTiming'])$(id).addEventListener('input',changed);
$('previewQuiz').addEventListener('click',()=>{
 const data=documentValue();$('previewTitle').textContent=data.title;$('previewContent').replaceChildren();const cover=node('div');renderMedia(data.cover,cover);$('previewContent').append(cover);
 for(const round of data.rounds){$('previewContent').append(node('h3',round.title));if(isClassic(data))$('previewContent').append(node('p',rulesText(round.rules)));for(const q of round.questions){const c=node('section');c.className='preview-question';c.append(node('h4',q.text),node('p',`Баллы: ${q.points} · Время: ${q.duration} сек.`));const media=node('div');renderMedia(q.media,media);c.append(media);if(['single','multiple'].includes(q.kind)){const ol=node('ol');q.options.forEach((o,i)=>ol.append(node('li',`${o}${q.correct?.includes(i)?' ✓':''}`)));c.append(ol);}else c.append(node('p',q.kind==='manual'?'Проверяет ведущий':`Допустимые ответы: ${(q.accepted||[]).join('; ')}`));c.append(node('p',q.explanation));const answer=node('div');renderMedia(q.answer_media,answer);c.append(answer);$('previewContent').append(c);}}
 $('preview').showModal();
});
async function session(){const {data}=await api.auth.getSession();if(!data.session)return;const allowed=await rpc('is_quiz_admin');if(!allowed){status('Учётная запись не имеет прав администратора.');await api.auth.signOut();return;}backupPrefix='quizroom_studio_backup_'+data.session.user.id+'_';let tabId=sessionStorage.getItem('quizroom_studio_tab');if(!tabId){tabId=crypto.randomUUID();sessionStorage.setItem('quizroom_studio_tab',tabId);}backupBase=backupPrefix+tabId+'_';backupKey=backupBase+crypto.randomUUID();$('authPanel').hidden=true;$('studio').hidden=false;await list();refreshBackupNotice();}
$('loginForm').addEventListener('submit',e=>{e.preventDefault();void action(async()=>{const {error}=await api.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});$('adminPassword').value='';if(error)throw error;await session();});});
$('logout').addEventListener('click',async()=>{if(busy||!await leave())return;clearTimeout(autoTimer);void action(async()=>{await api.auth.signOut();location.reload();});});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
session().catch(e=>status(e.message));

$('registerAdmin').addEventListener('click',()=>action(async()=>{if(!$('loginForm').reportValidity())return;const {error}=await api.auth.signUp({email:$('adminEmail').value.trim(),password:$('adminPassword').value,options:{emailRedirectTo:new URL('./admin.html',location.href).href}});$('adminPassword').value='';if(error)throw error;status('Подтвердите email по письму, затем вернитесь сюда и войдите. Доступ получат только разрешённые адреса.');}));

function renderCover(){
 $('coverUrl').value=doc.cover?.url||'';$('coverAlt').value=doc.cover?.alt||'';$('coverFile').value='';
 renderMedia(doc.cover,$('coverPreview'));
}
for(const id of ['coverUrl','coverAlt'])$(id).addEventListener('input',()=>{
 doc.cover=$('coverUrl').value.trim()?{type:'image',url:$('coverUrl').value.trim(),alt:$('coverAlt').value.trim()}:null;
 changed();renderMedia(doc.cover,$('coverPreview'));
});
$('removeCover').addEventListener('click',()=>{doc.cover=null;changed();renderCover();});
$('coverFile').addEventListener('change',async()=>{
 const file=$('coverFile').files?.[0];if(!file||!doc)return;
 const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
 if(!extensions[file.type]||file.size>20*1024*1024){status('Обложка: JPG, PNG, WebP или GIF до 20 МБ.');return;}
 const target=doc;uploads++;$('coverFile').disabled=true;status('Загружаем обложку…');
 try{const path=`covers/${crypto.randomUUID()}.${extensions[file.type]}`;const {error}=await api.storage.from('quiz-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
 const {data}=api.storage.from('quiz-media').getPublicUrl(path);
 if(doc!==target){status('Квиз был переключён. Вернитесь к нему и выберите обложку заново.');return;}
 doc.cover={type:'image',url:data.publicUrl,alt:$('coverAlt').value.trim()};changed();renderCover();status('Обложка загружена. Сохраните черновик и опубликуйте квиз, чтобы обновить каталог.');
 }catch(e){status(e.message||'Не удалось загрузить обложку');}finally{$('coverFile').disabled=false;uploads--;}
});

$('deleteQuiz').addEventListener('click',()=>action(async()=>{
 if(!current){status('Этот квиз ещё не сохранён. Полное удаление доступно для сохранённых квизов.');return;}
 const item=current;
 const dialog=$('deleteConfirm');dialog.returnValue='';
 $('deleteConfirmText').textContent=`Полностью удалить квиз «${item.draft.title||'Без названия'}»? Он исчезнет из каталога и раздела «Мои квизы». Черновик и неопубликованные изменения будут потеряны. Восстановить квиз через сайт нельзя.`;
 const confirmation=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='delete'),{once:true}));dialog.showModal();
 if(!await confirmation)return;
 await rpc('admin_delete_quiz',{p_id:item.id,p_revision:item.revision});
 clearTimeout(autoTimer);try{if(backupKey)localStorage.removeItem(backupKey);if(recoveredKey){localStorage.removeItem(recoveredKey);recoveredKey=null;}}catch{}$('backupNotice').hidden=true;current=null;doc=null;dirty=false;generation++;$('editor').hidden=true;await list();status('Квиз полностью удалён.');
}));

function showValidation(){
 const errors=validateQuiz(documentValue());$('validationPanel').hidden=!errors.length;$('validationList').replaceChildren();
 for(const err of errors){const li=node('li');button(err.text,()=>{
  let target;if(err.ri==null)target=$(err.field);else if(err.qi==null)target=$(`round-${err.ri}-title`);else{const fold=$(`question-${err.ri}-${err.qi}`);fold.open=true;const labels={text:'Текст вопроса',kind:'Тип ответа',points:'Баллы за правильный ответ',duration:'Время на ответ',accepted:'Допустимые ответы',explanation:'Пояснение к ответу'};target=[...fold.querySelectorAll('label')].find(e=>e.firstChild?.textContent?.startsWith(labels[err.field]||'Вариант'))?.querySelector('input,textarea,select');if(!target&&['media','answer_media'].includes(err.field)){const media=[...fold.querySelectorAll('details')][err.field==='media'?0:1];if(media){media.open=true;target=media.querySelector('input');}}target||=fold.querySelector('input,textarea,select');}
  target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus({preventScroll:true});
 },li);$('validationList').append(li);}
 if(errors.length)$('validationPanel').scrollIntoView({block:'start',behavior:'smooth'});else status('Проверка пройдена. Квиз готов к предпросмотру и публикации.');return !errors.length;
}
function exportDocument(value){downloadFile('quizroom-quiz-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({format:'quizroom-quiz',version:isClassic(value)?2:1,document:value},null,2));}
$('checkQuiz').addEventListener('click',showValidation);
$('quizSearch').addEventListener('input',renderList);$('quizFilter').addEventListener('change',renderList);
$('autoSave').addEventListener('change',scheduleSave);
$('exportQuiz').addEventListener('click',()=>exportDocument(documentValue()));
$('exportBackup').addEventListener('click',()=>{if(recovery?.document)exportDocument(recovery.document);});
$('restoreDraft').addEventListener('click',async()=>{if(busy||uploads||!recovery?.document)return;let copy;try{copy=structuredClone(recovery);copy.document=importQuiz({format:'quizroom-quiz',version:isClassic(copy.document)?2:1,document:copy.document});}catch(e){status('Резервная копия повреждена. Скачайте её для ручного восстановления.');return;}const sourceKey=recoveryKey;if(!await leave())return;await open(copy.record?{...copy.record,draft:copy.document}:null,true,copy.document);recoveredKey=sourceKey;uncertainCreate=!!copy.uncertain_create;conflict=uncertainCreate;$('backupNotice').hidden=true;changed();status(uncertainCreate?'Резервная копия восстановлена. Создание на сервере ранее не было подтверждено: сначала обновите список и проверьте записи.':'Резервная копия восстановлена. При конфликте версий сохраните её как новый квиз.');});
$('copyQuiz').addEventListener('click',async()=>{if(busy||uploads||!doc)return;const value=documentValue();value.title=(value.title+' — копия').slice(0,100);await open(null,true,value);changed();status('Создана независимая копия. Она ещё не опубликована.');});
$('importQuiz').addEventListener('click',()=>{if(!busy)$('importQuizFile').click();});
$('importQuizFile').addEventListener('change',async()=>{const file=$('importQuizFile').files?.[0];if(!file)return;try{if(file.size>500000)throw Error('JSON-копия должна быть не больше 500 КБ.');const imported=importQuiz(JSON.parse(await file.text()));if(busy||uploads)throw Error('Дождитесь завершения сохранения или загрузки.');if(!await leave())return;await open(null,true,imported);changed();status('Копия загружена как новый неопубликованный квиз. Проверьте его перед публикацией.');}catch(e){status(e instanceof SyntaxError?'Не удалось прочитать JSON-копию':e.message);}finally{$('importQuizFile').value='';}});
$('undoEdit').addEventListener('click',()=>{if(!history.length)return;doc=history.pop();for(const [id,key]of [['quizTitle','title'],['quizCategory','category'],['quizIcon','icon'],['quizLevel','level'],['quizDescription','description'],['quizPrice','price'],['scoreTiming','score_timing'],['revealTiming','reveal_timing']])$(id).value=doc[key]??'';changed(true);renderRounds();renderCover();$('undoEdit').disabled=!history.length;status('Последнее изменение структуры отменено.');});
for(const [id,expand]of [['collapseQuestions',false],['expandQuestions',true]])$(id).addEventListener('click',()=>{allExpanded=expand;expanded=new WeakSet();for(const round of doc.rounds)for(const q of round.questions){if(expand)collapsed.delete(q);else collapsed.add(q);}for(const fold of $('roundEditor').querySelectorAll('.question-fold'))fold.open=expand;});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!$('studio').hidden&&!$('quizArea').hidden&&doc){e.preventDefault();void action(save);}});
window.addEventListener('online',()=>{if(dirty&&!conflict)scheduleSave();});
$('playPreview').addEventListener('click',()=>{if(!showValidation())return;const data=documentValue();const frame=$('playerPreviewFrame');frame.onload=()=>frame.contentWindow.postMessage({type:'quizroom-admin-preview',document:data},location.origin);frame.src='./quiz-preview.html?v=start1';$('playerPreview').showModal();});
$('playerPreview').addEventListener('close',()=>{$('playerPreviewFrame').src='about:blank';});
