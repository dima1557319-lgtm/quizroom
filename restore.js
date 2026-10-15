import {gameRpc} from './game-rpc.js?v=play2';
const $=id=>document.getElementById(id);let item=null;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function validateAccessFile(value){
 if(value?.version!==1||!['host','player'].includes(value.role)||!/^\d{6}$/.test(value.room_code||''))throw Error('Это не файл доступа QuizRoom');
 if(value.role==='host'?!uuid(value.host_secret):!uuid(value.player_id)||!uuid(value.player_secret))throw Error('Повреждён файл доступа');return value;
}
$('accessFile').addEventListener('change',async()=>{item=null;$('restoreAccess').disabled=true;$('restoreStatus').textContent='';try{const file=$('accessFile').files?.[0];if(!file)return;if(file.size>8192)throw Error('Файл доступа слишком большой');item=validateAccessFile(JSON.parse(await file.text()));$('restoreStatus').textContent=`Комната ${item.room_code}. Роль: ${item.role==='host'?'ведущий':'игрок'}. Нажмите «Восстановить доступ».`;$('restoreAccess').disabled=false;}catch(e){$('restoreStatus').textContent=e instanceof SyntaxError?'Не удалось прочитать JSON-файл':e.message;}});
$('restoreAccess').addEventListener('click',async()=>{if(!item)return;$('restoreAccess').disabled=true;$('accessFile').disabled=true;try{
 const host=item.role==='host';const {data,error}=await gameRpc(host?'get_quiz_game_host':'get_quiz_game_player',host?{p_code:item.room_code,p_host_secret:item.host_secret}:{p_player_id:item.player_id,p_player_secret:item.player_secret});if(error)throw error;if(data.room_code!==item.room_code)throw Error('Файл относится к другой комнате');
 const keys=['quizroom_room_code','quizroom_host_secret','quizroom_player_room','quizroom_player_id','quizroom_player_secret'];for(const key of keys)sessionStorage.removeItem(key);
 sessionStorage.setItem('quizroom_role',item.role);if(host){sessionStorage.setItem('quizroom_room_code',item.room_code);sessionStorage.setItem('quizroom_host_secret',item.host_secret);}else{sessionStorage.setItem('quizroom_player_room',item.room_code);sessionStorage.setItem('quizroom_player_id',item.player_id);sessionStorage.setItem('quizroom_player_secret',item.player_secret);}
 location.assign(host?'./host.html':'./player.html');
 }catch(e){$('restoreStatus').textContent=e.message||'Не удалось восстановить доступ. Проверьте соединение и попробуйте снова.';$('restoreAccess').disabled=false;}finally{$('accessFile').disabled=false;}});
