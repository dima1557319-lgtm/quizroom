import {downloadFile,resultsCsv} from './game-files.js?v=classic1';
let signature='';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
export function renderGameSummary(data){
 const round=document.getElementById('roundBreak');if(round){round.hidden=!(data.status==='playing'&&data.phase==='reveal'&&data.question?.round_end);if(!round.hidden){round.replaceChildren(node('h3',`${data.question.round||'Тур'} завершён`),node('p',data.next_round_title?`Далее: ${data.next_round_title}. Ведущий начнёт следующий тур, когда все будут готовы.`:'Все вопросы пройдены. Ведущий покажет итоговые результаты.'));}}
 if(round&&!round.hidden&&data.play_mode==='everyone'){
  round.lastChild.textContent=data.next_round_title?`Далее: ${data.next_round_title}. Организатор начнёт следующий тур, когда все будут готовы.`:'Все вопросы пройдены. Организатор покажет итоговые результаты.';
 }
 const target=document.getElementById('results');if(!target)return;target.hidden=data.status!=='finished'||!data.results;
 if(target.hidden)return;const report=data.results,key=JSON.stringify(report);if(signature===key)return;signature=key;
 const winners=report.players.filter(p=>p.rank===1).map(p=>p.player_name);
 const fold=node('details');fold.className='game-results-fold';fold.append(node('summary','Итоги игры'));target.replaceChildren(fold);
 fold.append(node('p',report.quiz_title),node('p',winners.length?`${winners.length===1?'Победитель':'Первое место разделили'}: ${winners.join(', ')}`:'Игра завершена'),node('p',`Участников: ${report.players.length}. ${report.version===2?'При равной сумме учитываются правила сравнения туров.':'При равенстве баллов — одинаковое место.'}`));
 for(const [label,extension,content,type] of [['Скачать результаты CSV','csv',()=>resultsCsv(report),'text/csv;charset=utf-8'],['Скачать результаты JSON','json',()=>JSON.stringify(report,null,2),'application/json']]){const b=node('button',label);b.type='button';b.addEventListener('click',()=>downloadFile(`quizroom-results-${report.room_code}.${extension}`,content(),type));fold.append(b);}
 if(report.finish_reason==='ended_by_host')fold.append(node('p','Игра завершена ведущим досрочно.'));
 fold.append(node('p','Результаты сохранены на сервере. Для повторного открытия этой комнаты сохраните файл доступа.'));
}
