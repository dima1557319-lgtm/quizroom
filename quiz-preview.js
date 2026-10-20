import {renderRichGame} from './rich-game.js?v=daily2';
let latest;function renderGame(data,answer){latest=data;renderRichGame(data,answer);tick();}
function tick(){if(!latest)return;const seconds=Math.max(0,Math.ceil((Date.parse(latest.question.deadline)-Date.now())/1000));document.getElementById('gameTimer').textContent=latest.phase==='question'?`Осталось: ${seconds} сек.`:'';for(const control of document.querySelectorAll('[data-rich-answer]'))control.disabled=latest.phase!=='question'||latest.my_response!=null||seconds===0;}
setInterval(tick,250);
import {validateQuiz,importQuiz} from './studio-document.js?v=classic3';
import {isClassic} from './classic-document.js?v=classic3';
import {startClassicPreview} from './classic-preview.js?v=tick1';
const $=id=>document.getElementById(id);let doc,questions=[],index=0,phase='question',started=Date.now(),responses=[],scores=[],graded=[];
function points(q,response){
 if(q.kind==='manual')return 0;
 if(q.kind==='text'){const normalize=s=>{const v=s.trim().replace(/\s+/g,' ');return q.case_sensitive?v:v.toLowerCase().replaceAll('ё','е');};return q.accepted.some(a=>normalize(a)===normalize(response.text))?Number(q.points):0;}
 const chosen=response.choices||[],correct=q.correct;const exact=chosen.length===correct.length&&chosen.every(i=>correct.includes(i));
 return Math.round(Number(q.points)*(q.kind==='multiple'&&q.partial?Math.max(0,(chosen.filter(i=>correct.includes(i)).length-chosen.filter(i=>!correct.includes(i)).length)/correct.length):exact?1:0)*100)/100;
}
function draw(){
 const q=questions[index],finished=phase==='finished',roundEnd=index===questions.length-1||q.round_number!==questions[index+1].round_number;
 const revealed=phase!=='question'&&(doc.reveal_timing==='question'||doc.reveal_timing==='round'&&roundEnd||finished);
 const shown={...q,id:'preview-'+index,number:index+1,deadline:new Date(started+q.duration*1000).toISOString(),round_end:roundEnd,revealed};
 delete shown.correct;delete shown.accepted;delete shown.explanation;delete shown.answer_media;
 if(revealed){shown.correct_choices=q.correct;shown.accepted=q.accepted;shown.explanation=q.explanation;shown.answer_media=q.answer_media;}
 const review=phase!=='question'&&((doc.reveal_timing==='round'&&roundEnd)||finished&&doc.reveal_timing==='quiz')?questions.slice(0,index+1).map((item,i)=>({...item,number:i+1,correct_choices:item.correct})).filter(item=>finished||item.round_number===q.round_number):[];
 renderGame({preview:true,status:finished?'finished':'playing',phase:finished?'finished':phase,server_now:new Date().toISOString(),total_questions:questions.length,players:[{}],question:shown,my_response:responses[index]||null,answer_count:responses[index]?1:0,next_round_title:questions[index+1]?.round||null,review},(_,response)=>{if(phase!=='question'||responses[index])return;if(Date.now()>started+q.duration*1000){$('previewError').textContent='Время вышло. Закройте вопрос или начните сначала.';return;}responses[index]=response;scores[index]=points(q,response);draw();});
 let visible=finished?questions.length:doc.score_timing==='quiz'?0:doc.score_timing==='round'?phase==='reveal'&&roundEnd?index+1:questions.findIndex(x=>x.round_number===q.round_number):phase==='reveal'?index+1:index;
 $('previewScore').textContent=`Пробные баллы: ${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(scores.slice(0,visible).reduce((a,b)=>a+(b||0),0))}`;
 $('previewState').textContent=`${doc.title} · ${finished?'Проверка завершена':'Роль игрока · '+(index+1)+' / '+questions.length}`;
 $('previewReveal').hidden=phase!=='question';$('previewNext').hidden=phase!=='reveal';$('previewNext').textContent=index===questions.length-1?'Завершить проверку':roundEnd?'Начать следующий тур':'Следующий вопрос';$('previewRestart').hidden=false;
 $('manualPanel').hidden=finished||q.kind!=='manual'||!responses[index]||graded[index];$('manualScore').max=q.points;
}
function start(){index=0;phase='question';started=Date.now();responses=[];scores=[];graded=[];$('previewError').textContent='';draw();}
window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='quizroom-admin-preview')return;try{doc=importQuiz({format:'quizroom-quiz',version:isClassic(event.data.document)?2:1,document:event.data.document});if(validateQuiz(doc).length)throw Error('Вернитесь в конструктор и исправьте ошибки квиза');if(isClassic(doc)){startClassicPreview(doc);return;}questions=doc.rounds.flatMap((r,i)=>r.questions.map(q=>({...q,round:r.title,round_number:i+1})));start();}catch(e){$('previewError').textContent=e.message;}});
$('previewReveal').onclick=()=>{phase='reveal';draw();};
$('previewNext').onclick=()=>{if(questions[index].kind==='manual'&&responses[index]&&!graded[index]){$('previewError').textContent='Сначала примените пробную ручную оценку.';return;}$('previewError').textContent='';if(index===questions.length-1)phase='finished';else{index++;phase='question';started=Date.now();}draw();};
$('previewRestart').onclick=start;
$('applyManual').onclick=()=>{const value=$('manualScore').value.replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(value)||Number(value)>questions[index].points){$('previewError').textContent='Укажите оценку от 0 до стоимости вопроса, до двух знаков после запятой.';return;}scores[index]=Number(value);graded[index]=true;$('previewError').textContent='';draw();};
