// Show an actionable state even if a browser cannot load an imported module.
(() => {
 const status=document.getElementById('status');
 const retry=document.createElement('button');retry.type='button';retry.textContent='Повторить загрузку игры';retry.hidden=true;retry.addEventListener('click',()=>location.reload());status.after(retry);
 const failed=()=>{status.textContent='Не удалось загрузить файлы игры. Проверьте интернет и повторите загрузку; доступ к комнате сохранён в этой вкладке.';retry.hidden=false;};
 const timer=setTimeout(failed,12000);
 import('./player.js?v=fold1').then(()=>{clearTimeout(timer);retry.hidden=true;}).catch(()=>{clearTimeout(timer);failed();});
})();
