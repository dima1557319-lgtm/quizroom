export const isClassic=d=>d?.format==='classic'&&d.schema_version===2;
export function newestClassic(old,data){
 if(old?.format!=='classic'||data?.format!=='classic'||old.room_code!==data.room_code)return data;
 if(old.classic.version>data.classic.version)return old;
 const previous=new Map(old.classic.drafts.map(d=>[d.question_id,d]));
 return {...data,classic:{...data.classic,drafts:data.classic.drafts.map(d=>previous.get(d.question_id)?.revision>d.revision?previous.get(d.question_id):d).concat(old.classic.drafts.filter(d=>!data.classic.drafts.some(x=>x.question_id===d.question_id)))}};
}
const uid=()=>crypto.randomUUID();
export function roundRules(overrides={}){return {submission:'round',repeat:true,repeat_seconds:60,submit_seconds:30,transition:'manual',score_timing:'round',reveal_timing:'round',stakes:[0],break_seconds:0,break_manual:false,media_clock:'with_question',text:'',difficulty:'Смешанный',theme:'',theme_hidden:false,...overrides};}
export function classicTemplate(seven=true){
 const titles=['Выбор ответа','Логика','Аудио','Риск','Общая тема','Сложные задачи','Финал'];
 return {schema_version:2,format:'classic',title:'Новая многораундовая игра',description:'',category:'Общие знания',icon:'🎲',level:'Средний',price:0,score_timing:'round',reveal_timing:'round',tie_break:'reverse_rounds',rounds:(seven?titles:['Тур 1']).map((title,i)=>({id:uid(),title,rules:roundRules({repeat:i!==6,stakes:i===3?[0,1]:i===6?[0,1,2]:[0],break_manual:i===2||i===5}),questions:Array.from({length:seven?(i===5?3:6):1},()=>({id:uid(),text:'',kind:i===0?'single':'text',options:i===0?['','','','']:[],correct:i===0?[0]:[],accepted:[],points:i===5?2:1,duration:i===5?120:i===0||i===2?30:60,explanation:'',animation:'none'}))}))};
}
export const stakePolicy=(r,n)=>r.stake_policy?.find(p=>p.stake===n)||{stake:n,correct_bonus:n,wrong:-n};
export function rulesText(r){return [r.theme?`Тема: ${r.theme}.`:'',r.submission==='round'?'Ответы можно менять до сдачи бланка.':'Каждый отправленный ответ окончательный.',r.repeat?`Повтор вопросов: ${r.repeat_seconds} сек.`:'Повтора вопросов нет.',r.submission==='round'?`На сдачу: ${r.submit_seconds} сек.`:'',(r.stakes.length>1||r.stake_policy)?r.stakes.map(n=>{const p=stakePolicy(r,n);return `Ставка ${n}: верно — стоимость ${p.correct_bonus<0?'−':'+'} ${Math.abs(p.correct_bonus)}, ошибка ${p.wrong}, пропуск 0.`;}).join(' '):'Без ставок. Ошибка и пропуск: 0.',`Разбор: ${r.reveal_timing==='question'?'после вопроса':r.reveal_timing==='round'?'после тура':'в конце игры'}.`,`Баллы: ${r.score_timing==='question'?'после вопроса':r.score_timing==='round'?'после тура':'в конце игры'}.`,r.text].filter(Boolean).join(' ');}
export function classicErrors(d){
 if(!isClassic(d))return [];
 const errors=[];const add=(text,ri)=>errors.push({text:`Тур ${ri+1}: ${text}`,field:'title',ri});
 const ids=new Set();
 d.rounds.forEach((r,ri)=>{
  const s=r.rules;
  if(!s){add('укажите правила тура',ri);return;}
  if(!['round','question'].includes(s.submission)||!['manual','auto'].includes(s.transition)||!['with_question','after_media'].includes(s.media_clock))add('неверный режим тура',ri);
  for(const k of ['repeat_seconds','submit_seconds','break_seconds'])if(!Number.isInteger(s[k])||s[k]<(k==='break_seconds'?0:5)||s[k]>1800)add('время этапа: целое число от 5 до 1800 секунд (перерыв может быть 0)',ri);
  for(const k of ['repeat','break_manual'])if(typeof s[k]!=='boolean')add('неверная настройка повтора или перерыва',ri);
  for(const k of ['score_timing','reveal_timing'])if(!['question','round','quiz'].includes(s[k]))add('неверный момент начисления или разбора',ri);
  if(s.submission==='round'&&(s.score_timing==='question'||s.reveal_timing==='question'))add('общий бланк раскрывает ответы и баллы только после тура или игры',ri);
  if(!Array.isArray(s.stakes)||!s.stakes.length||s.stakes.length>3||s.stakes.some(v=>![0,1,2].includes(v))||new Set(s.stakes).size!==s.stakes.length||!s.stakes.includes(0))add('ставки: 0, 1 или 2, без повторов и с вариантом 0',ri);
  if(typeof s.text!=='string'||s.text.length>2000||!['Лёгкий','Средний','Сложный','Смешанный'].includes(s.difficulty))add('текст правил до 2000 символов и выбранная сложность',ri);
  if(s.stake_policy!=null&&(!Array.isArray(s.stake_policy)||s.stake_policy.length!==s.stakes.length||new Set(s.stake_policy.map(p=>p.stake)).size!==s.stakes.length||s.stake_policy.some(p=>!s.stakes.includes(p.stake)||['correct_bonus','wrong'].some(k=>!Number.isFinite(p[k])||Math.abs(p[k])>10000||Math.abs(Math.round(p[k]*100)-p[k]*100)>0.000001))))add('таблица ставок: по одной строке на ставку, значения от −10000 до 10000 с двумя знаками',ri);
  for(const item of [r,...r.questions]){if(typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.id)||ids.has(item.id))add('идентификаторы туров и вопросов должны быть уникальны',ri);ids.add(item.id);}
  if(s.theme!=null&&(typeof s.theme!=='string'||s.theme.length>100)||s.theme_hidden!=null&&typeof s.theme_hidden!=='boolean')add('тема до 100 символов и режим её раскрытия',ri);
  for(const q of r.questions){if(q.difficulty!=null&&!['Лёгкий','Средний','Сложный'].includes(q.difficulty))add('неверная сложность вопроса',ri);if(q.kind==='manual')add('в многораундовой игре используйте автоматическую проверку',ri);if(s.stakes?.length>1&&q.partial)add('ставки несовместимы с частичным зачётом',ri);
   if(q.media_start!=null||q.media_end!=null){if(!q.media||!['audio','video'].includes(q.media.type)||!Number.isFinite(q.media_start)||!Number.isFinite(q.media_end)||q.media_start<0||q.media_end<=q.media_start||q.media_end-q.media_start>1800)add('медиафрагмент: начало и конец в секундах, длина до 1800',ri);}
   if(s.media_clock==='after_media'&&q.media&&['audio','video'].includes(q.media.type)&&q.media_end==null)add('для таймера после медиа задайте начало и конец фрагмента',ri);
  }
 });
 if(!['reverse_rounds','shared'].includes(d.tie_break))errors.push({text:'Выберите порядок определения мест',field:'quizTitle'});
 return errors;
}
export function restoreClassic(original,clean){
 if(!isClassic(original))return clean;
 const allowed=['submission','repeat','repeat_seconds','submit_seconds','transition','score_timing','reveal_timing','stakes','break_seconds','break_manual','media_clock','text','difficulty','stake_policy','theme','theme_hidden'];
 return {...clean,format:'classic',schema_version:2,tie_break:original.tie_break,rounds:clean.rounds.map((r,i)=>({...r,id:original.rounds[i].id,rules:Object.fromEntries(allowed.filter(k=>original.rounds[i].rules?.[k]!==undefined).map(k=>[k,original.rounds[i].rules?.[k]])),questions:r.questions.map((q,j)=>({...q,id:original.rounds[i].questions[j].id,difficulty:original.rounds[i].questions[j].difficulty,media_start:original.rounds[i].questions[j].media_start,media_end:original.rounds[i].questions[j].media_end}))}))};
}
