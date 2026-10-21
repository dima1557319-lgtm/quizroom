import {roundRules,rulesText,stakePolicy} from './classic-document.js?v=hints1';
export function editRoundRules(parent,round,{field,select,check,refresh}){
 const box=document.createElement('details');box.open=true;const title=document.createElement('summary');title.textContent='Правила и сценарий тура';box.append(title);parent.append(box);
 const s=round.rules||=roundRules();
 const live=document.createElement('p');live.className='rules-preview';const update=()=>{live.textContent=rulesText(s);};
 const choose=(label,key,opts)=>select(box,label,s[key],opts,v=>{s[key]=v;if(s.submission==='round'){if(s.score_timing==='question')s.score_timing='round';if(s.reveal_timing==='question')s.reveal_timing='round';}update();if(key==='submission')refresh();});
 choose('Как сдавать ответы','submission',[['round','Общий бланк тура — можно исправлять'],['question','Каждый вопрос отдельно — ответ окончательный']]);
 field(box,'Общая тема тура (необязательно)',s.theme||'',v=>{s.theme=v;update();}).maxLength=100;check(box,'Скрывать тему до разбора',s.theme_hidden,v=>{s.theme_hidden=v;update();});
 choose('Сложность тура','difficulty',['Лёгкий','Средний','Сложный','Смешанный'].map(v=>[v,v]));
 choose('Переключение вопросов','transition',[['manual','Организатор продолжает после времени обсуждения'],['auto','Автоматически после времени обсуждения']]);
 const timings=s.submission==='round'?[['round','После тура'],['quiz','В конце игры']]:[['question','После вопроса'],['round','После тура'],['quiz','В конце игры']];
 choose('Когда показывать баллы тура','score_timing',timings);choose('Когда раскрывать ответы тура','reveal_timing',timings);
 select(box,'Ставки',s.stakes.join(','),[['0','Без ставок'],['0,1','Без ставки или ставка 1'],['0,1,2','Без ставки или ставка 1/2']],v=>{s.stakes=v.split(',').map(Number);s.stake_policy=s.stakes.map(n=>stakePolicy(s,n));update();refresh();});
 const policy=document.createElement('details');policy.append(Object.assign(document.createElement('summary'),{textContent:'Таблица начислений по ставкам'}));box.append(policy);
 for(const n of s.stakes){for(const [key,label]of [['correct_bonus','Верно: прибавка к стоимости'],['wrong','Ошибка: итоговые баллы']])field(policy,`Ставка ${n} · ${label}`,stakePolicy(s,n)[key],v=>{s.stake_policy=s.stakes.map(st=>({...stakePolicy(s,st)}));s.stake_policy.find(p=>p.stake===n)[key]=Number(v);update();},'number').step='0.01';}policy.append(Object.assign(document.createElement('p'),{textContent:'Пропуск: 0 баллов при любой ставке. Таблица показывается игрокам до начала тура.'}));
 check(box,'Повторить показанные вопросы перед сдачей',s.repeat,v=>{s.repeat=v;update();});
 for(const [k,label]of [['repeat_seconds','Время повтора, секунд'],['submit_seconds','Время на сдачу, секунд'],['break_seconds','Перерыв после тура, секунд (0 — без таймера)']]){const input=field(box,label,s[k],v=>{s[k]=Number(v);update();},'number');input.min=k==='break_seconds'?0:5;input.max=1800;}
 check(box,'Перерыв до команды организатора',s.break_manual,v=>{s.break_manual=v;update();});
 choose('Таймер и аудио/видео','media_clock',[['with_question','Обсуждение начинается вместе с вопросом'],['after_media','Обсуждение после медиа на общем экране']]);
 field(box,'Дополнительные правила для игроков',s.text,v=>{s.text=v;update();},'textarea').maxLength=2000;
 box.append(live);update();
}
