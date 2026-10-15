import {downloadFile} from './game-files.js?v=play2';
export function installAccessBackup(role){const button=document.getElementById('saveAccess');if(!button)return;button.addEventListener('click',()=>{
 try{let item={version:1,role};if(role==='host'){if(sessionStorage.getItem('quizroom_role')==='player')throw Error('Доступ ведущего отсутствует');item.room_code=sessionStorage.getItem('quizroom_room_code');item.host_secret=sessionStorage.getItem('quizroom_host_secret');if(!item.host_secret)throw Error('Сначала откройте свою комнату');}else{item.room_code=sessionStorage.getItem('quizroom_player_room');item.player_id=sessionStorage.getItem('quizroom_player_id');item.player_secret=sessionStorage.getItem('quizroom_player_secret');if(!item.player_secret)throw Error('Сначала войдите в комнату');}
 downloadFile(`quizroom-access-${role}-${item.room_code}.json`,JSON.stringify(item,null,2));document.getElementById('accessStatus').textContent='Файл доступа сохранён. Он позволит вернуться после закрытия вкладки. Храните его у себя: файл ведущего даёт управление комнатой.';
 }catch(e){document.getElementById('accessStatus').textContent=e.message;}
 });}
