export function downloadFile(name,content,type='application/json'){
 const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function csvCell(value){const raw=String(value??'');const safe=/^[\s]*[=+\-@]/.test(raw)||/^[\t\r\n]/.test(raw)?"'"+raw:raw;return '"'+safe.replaceAll('"','""')+'"';}
export function resultsCsv(report){return '\ufeff'+[['Квиз',report.quiz_title],['Комната',report.room_code],['Завершена',report.finished_at],[],['Место','Игрок','Баллы'],...report.players.map(p=>[p.rank,p.player_name,p.score])].map(row=>row.map(csvCell).join(';')).join('\r\n');}
