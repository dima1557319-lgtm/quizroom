const el=id=>document.getElementById(id);
let qrCode;
export function renderEveryoneControls(data,pending=false){
 const everyone=data.play_mode==='everyone';
 el('everyoneControls').hidden=!everyone;
 if(!everyone)return;
 const waiting=data.status==='waiting',playing=data.status==='playing';
 el('organizerStatus').textContent=data.status==='finished'?'Все сыграли — итоги готовы.':
  data.can_control?'Вы организатор и тоже играете. После всех ответов или окончания времени вопрос закроется автоматически.':
  `Управляет: ${data.controller_name||'ожидаем первого игрока'}. Если организатор отключится, управление перейдёт следующему активному игроку через 30 секунд.`;
 el('inviteRoom').hidden=!waiting;
 const url=new URL('./join.html',location.href);url.searchParams.set('code',data.room_code);
 el('playerJoinLink').href=url.toString();
 if(waiting&&qrCode!==data.room_code&&typeof QRCode!=='undefined'){
  el('playerQr').replaceChildren();
  new QRCode(el('playerQr'),{text:url.toString(),width:180,height:180});qrCode=data.room_code;
 }
 el('everyoneStart').hidden=!waiting||!data.can_control;
 el('everyoneStart').disabled=pending||!data.players.length;
 el('everyoneNext').hidden=!playing||!data.can_control||data.phase!=='reveal';
 el('everyoneNext').disabled=pending;
 el('everyoneNext').textContent=data.question?.number===data.total_questions?'Показать итоги':
  data.question?.round_end?'Начать следующий тур':'Следующий вопрос';
 if(data.format==='classic'){
  el('everyoneNext').hidden=true;
  el('organizerStatus').textContent=data.can_control?'Вы организатор и тоже играете. Правила каждого тура показаны перед началом.':`Управляет: ${data.controller_name||'ожидаем первого игрока'}. Передача управления — после 30 секунд без связи.`;
 }
}
