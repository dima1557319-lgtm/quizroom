// Runs while collapsed, before the tour timer starts; errors remain in the summary.
export function prepareClassicMedia(root,assets,ready){
 if(!assets?.length){ready(true);return;}
 const box=document.createElement('details');box.className='classic-media-check';const title=document.createElement('summary');title.textContent='Проверка медиа перед туром · проверяем…';box.append(title);root.append(box);
 let loaded=0,failed=0,accepted=false;const report=()=>{title.textContent='Проверка медиа перед туром · '+(accepted?'подтверждено вручную':loaded===assets.length?'готово':failed?'есть ошибки':`проверяем ${loaded} / ${assets.length}`);if(box.parentNode===root)ready(accepted||loaded===assets.length);};
 const help=document.createElement('p');help.textContent='Дождитесь проверки файлов. При ошибке исправьте доступ к файлу или явно продолжите без него. Время обсуждения ещё не идёт.';box.append(help);
 assets.forEach((asset,i)=>{const row=document.createElement('p');row.textContent=`Файл ${i+1}: проверяем…`;box.append(row);const element=document.createElement(asset.type==='image'?'img':asset.type);element.hidden=true;element.preload='metadata';let done=false;
  element.addEventListener(asset.type==='image'?'load':'loadedmetadata',()=>{if(done)return;done=true;loaded++;row.textContent=`Файл ${i+1}: доступен`;report();},{once:true});
  element.addEventListener('error',()=>{if(done)return;done=true;failed++;report();row.textContent=`Файл ${i+1}: не удалось загрузить. Проверьте ссылку или сеть.`;},{once:true});element.src=asset.url;box.append(element);
 });
 const label=document.createElement('label'),confirm=document.createElement('input');confirm.type='checkbox';confirm.addEventListener('change',()=>{accepted=confirm.checked;report();});label.append(confirm,document.createTextNode(' Медиа проверены на общем экране; продолжить, даже если браузер не подтвердил загрузку'));box.append(label);report();
}
