import {isClassic,classicErrors,restoreClassic} from './classic-document.js?v=classic3';
export const countQuestions=d=>d.rounds.reduce((n,r)=>n+r.questions.length,0);
export function validateQuiz(d){
 const errors=[];const add=(text,field,ri,qi)=>errors.push({text,field,ri,qi});
 if(d.format&&d.format!=='simple'&&!isClassic(d))add('Неизвестный формат квиза','quizTitle');
 const length=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.trim().length<=max;
 const money=(v,max)=>/^\d+(\.\d{1,2})?$/.test(String(v))&&Number(v)<=max;
 const media=(m,cover=false)=>m==null||(typeof m==='object'&&(cover?m.type==='image':['image','audio','video'].includes(m.type))&&typeof m.url==='string'&&/^https:\/\/[^\s]+$/.test(m.url)&&m.url.length<=2000&&(!cover||String(m.alt||'').length<=200));
 if(!length(d.title,1,100))add('Название квиза: от 1 до 100 символов','quizTitle');
 if(String(d.category||'').length>60)add('Тема: до 60 символов','quizCategory');
 if(String(d.description||'').length>500)add('Описание: до 500 символов','quizDescription');
 if(!money(d.price,99999999.99))add('Цена: положительное число или 0, до двух знаков после запятой','quizPrice');
 if(!media(d.cover,true))add('Обложка: изображение по HTTPS, описание до 200 символов','coverUrl');
 for(const key of ['score_timing','reveal_timing'])if(!['question','round','quiz'].includes(d[key]))add('Выберите правила начисления и раскрытия ответов',key==='score_timing'?'scoreTiming':'revealTiming');
 if(!Array.isArray(d.rounds)||d.rounds.length>20){add('Добавьте от 1 до 20 туров','addRound');return errors;}
 if(countQuestions(d)<1||countQuestions(d)>50)add('В квизе должно быть от 1 до 50 вопросов','addRound');
 d.rounds.forEach((r,ri)=>{
  const roundError=t=>add(`Тур ${ri+1}: ${t}`,'title',ri);
  if(!length(r.title,1,100))roundError('укажите название до 100 символов');
  if(!r.questions.length)roundError('добавьте хотя бы один вопрос');
  r.questions.forEach((q,qi)=>{
   const err=(t,f)=>add(`Тур ${ri+1}, вопрос ${qi+1}: ${t}`,f,ri,qi);
   if(!length(q.text,1,500))err('текст от 1 до 500 символов','text');
   if(!['single','multiple','text','manual'].includes(q.kind))err('выберите тип ответа','kind');
   if(!money(q.points,10000))err('баллы от 0 до 10000, до двух знаков после запятой','points');
   if(!Number.isInteger(q.duration)||q.duration<5||q.duration>300)err('время от 5 до 300 целых секунд','duration');
   if(['single','multiple'].includes(q.kind)){
    const opts=q.options||[],correct=q.correct||[];
    if(opts.length<2||opts.length>8||opts.some(o=>!length(o,1,200)))err('заполните от 2 до 8 вариантов (до 200 символов)','options');
    if(new Set(opts.map(o=>String(o).trim().toLowerCase())).size!==opts.length)err('варианты не должны повторяться','options');
    if(!correct.length||(q.kind==='single'&&correct.length!==1)||new Set(correct).size!==correct.length||correct.some(i=>!Number.isInteger(i)||i<0||i>=opts.length))err('отметьте правильные варианты','options');
   }
   if(q.kind==='text'&&(!Array.isArray(q.accepted)||q.accepted.length<1||q.accepted.length>30||q.accepted.some(a=>!length(a,1,500))))err('добавьте от 1 до 30 допустимых написаний','accepted');
   if(String(q.explanation||'').length>2000)err('пояснение до 2000 символов','explanation');
   for(const key of ['media','answer_media'])if(!media(q[key]))err('медиа должно иметь тип и HTTPS-ссылку',key);
  });
 });return errors.concat(classicErrors(d));
}
export function importQuiz(value){
 if(value?.format!=='quizroom-quiz'||![1,2].includes(value.version))throw Error('Выберите JSON-копию квиза, сохранённую в конструкторе QuizRoom.');
 const d=value.document;
 if(value.version===1&&isClassic(d))throw Error('Для многораундовой игры нужна JSON-копия версии 2.');
 if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.rounds)||d.rounds.length>20)throw Error('Некорректная структура туров.');
 // An imported backup never carries record ids, server revisions or access tokens.
 const text=(v,max)=>{if(v!=null&&(typeof v!=='string'||v.length>max))throw Error('В копии слишком длинное или некорректное текстовое поле.');return v||'';};
 const media=m=>{if(m==null)return null;if(typeof m!=='object')throw Error('Некорректное медиа');return {type:text(m.type,20),url:text(m.url,2000),alt:text(m.alt,200)};};
 const result={title:text(d.title,100),description:text(d.description,500),category:text(d.category,60),icon:text(d.icon,8),level:text(d.level,30),price:d.price,score_timing:d.score_timing,reveal_timing:d.reveal_timing,cover:media(d.cover),rounds:d.rounds.map(r=>{
  if(!r||!Array.isArray(r.questions)||r.questions.length>50)throw Error('Некорректный список вопросов');
  return {title:text(r.title,100),questions:r.questions.map(q=>{
   if(!q||!['single','multiple','text','manual'].includes(q.kind))throw Error('Неизвестный тип ответа');
   if(q.options!=null&&(!Array.isArray(q.options)||q.options.length>8))throw Error('Некорректные варианты');
   if(q.correct!=null&&(!Array.isArray(q.correct)||q.correct.length>8||q.correct.some(i=>!Number.isInteger(i))))throw Error('Некорректные правильные ответы');
   if(q.accepted!=null&&(!Array.isArray(q.accepted)||q.accepted.length>30))throw Error('Некорректные текстовые ответы');
   for(const key of ['points','duration'])if(!['number','string'].includes(typeof q[key])||String(q[key]).length>30)throw Error('Некорректные баллы или время');
   return {text:text(q.text,500),kind:q.kind,options:(q.options||[]).map(o=>text(o,200)),correct:q.correct||[],accepted:(q.accepted||[]).map(a=>text(a,500)),points:q.points,duration:q.duration,partial:!!q.partial,case_sensitive:!!q.case_sensitive,explanation:text(q.explanation,2000),animation:q.animation==='fade'?'fade':'none',media:media(q.media),answer_media:media(q.answer_media)};
  })};
 })};
 if(countQuestions(result)>50)throw Error('В квизе может быть не больше 50 вопросов');
 if(!['number','string'].includes(typeof result.price)||String(result.price).length>30||!['question','round','quiz'].includes(result.score_timing)||!['question','round','quiz'].includes(result.reveal_timing))throw Error('Некорректная цена или правила квиза');
 for(const r of result.rounds)for(const q of r.questions){if(!['single','multiple'].includes(q.kind)){q.options=[];q.correct=[];}if(q.kind!=='text')q.accepted=[];}
 if(value.version===2&&!isClassic(d))throw Error('Неизвестный формат многораундовой игры.');
 return restoreClassic(d,result);
}
