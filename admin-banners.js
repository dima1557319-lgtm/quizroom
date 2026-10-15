import {adminClient as api} from './admin-client.js?v=studio1';
import {renderBanners} from './banner-view.js?v=digest1';
const $=id=>document.getElementById(id);
const defaults=()=>({title:'',text:'',kind:'announcement',position:10,image_url:'',image_alt:'',link_url:'',link_label:'Подробнее'});
const fields={bannerTitle:'title',bannerText:'text',bannerKind:'kind',bannerPosition:'position',bannerImageUrl:'image_url',bannerImageAlt:'image_alt',bannerLinkUrl:'link_url',bannerLinkLabel:'link_label'};
let current=null,dirty=false,busy=false,loaded=false;
const status=text=>$('bannerStatus').textContent=text;
function value(){const d={};for(const [id,key]of Object.entries(fields))d[key]=key==='position'?Number($(id).value):$(id).value.trim();return d;}
function preview(){renderBanners($('bannerPreview'),[value()]);}
function changed(){dirty=true;$('bannerSaveState').textContent='Есть несохранённые изменения';preview();}
async function rpc(name,args){const {data,error}=await api.rpc(name,args);if(error)throw error;return data;}
async function run(fn){if(busy)return;busy=true;for(const control of $('bannerStudio').querySelectorAll('input,textarea,select,button'))control.disabled=true;status('');try{await fn();}catch(e){status(e.message||'Не удалось выполнить действие');}finally{busy=false;for(const control of $('bannerStudio').querySelectorAll('input,textarea,select,button'))control.disabled=false;}}
function open(item){
 if(dirty){status('Сначала сохраните текущий баннер, чтобы не потерять изменения.');return;}
 current=item;const d={...defaults(),...item?.draft};for(const [id,key]of Object.entries(fields))$(id).value=d[key]??'';
 $('bannerImageFile').value='';$('bannerEditor').hidden=false;$('bannerSaveState').textContent=item?`Черновик: версия ${item.revision}${item.published_revision?' · на главной версия '+item.published_revision:''}`:'Новый баннер ещё не сохранён';preview();$('bannerEditor').scrollIntoView({block:'start'});$('bannerTitle').focus({preventScroll:true});
}
async function list(){const items=await rpc('admin_list_home_banners');$('bannerList').replaceChildren();for(const item of items){const row=document.createElement('article');row.className='banner-list-item';const title=document.createElement('strong');title.textContent=item.draft.title||'Без заголовка';const info=document.createElement('small');info.textContent=`${item.published_revision?'На главной':'Черновик'} · Порядок: ${item.draft.position}`;const edit=document.createElement('button');edit.className='secondary';edit.type='button';edit.textContent='Редактировать';edit.setAttribute('aria-label',`Редактировать баннер «${item.draft.title||'Без заголовка'}»`);edit.addEventListener('click',()=>{if(!busy)open(item);});row.append(title,info,edit);$('bannerList').append(row);}if(!items.length)$('bannerList').textContent='Баннеров пока нет. Создайте первый анонс.';}
async function save(){const item=await rpc('admin_save_home_banner',{p_id:current?.id||null,p_document:value(),p_revision:current?.revision||0});current=item;dirty=false;$('bannerSaveState').textContent=`Черновик сохранён · версия ${item.revision}`;await list();return item;}
async function loadQuizLinks(){const items=await rpc('list_quiz_catalog');$('bannerQuizLink').replaceChildren(new Option('Выберите опубликованный квиз',''));for(const q of items)$('bannerQuizLink').append(new Option(q.title,q.key));}
$('showBanners').addEventListener('click',()=>{if(busy)return;$('quizArea').hidden=true;$('bannerStudio').hidden=false;$('showBanners').setAttribute('aria-pressed','true');$('showQuizzes').setAttribute('aria-pressed','false');if(!loaded)void run(async()=>{await list();await loadQuizLinks();loaded=true;});});
$('showQuizzes').addEventListener('click',()=>{if(busy)return;$('quizArea').hidden=false;$('bannerStudio').hidden=true;$('showBanners').setAttribute('aria-pressed','false');$('showQuizzes').setAttribute('aria-pressed','true');});
$('newBanner').addEventListener('click',()=>open(null));$('reloadBanners').addEventListener('click',()=>run(async()=>{await list();await loadQuizLinks();}));
for(const id of Object.keys(fields))$(id).addEventListener('input',changed);
$('bannerQuizLink').addEventListener('change',()=>{if(!$('bannerQuizLink').value)return;const url=new URL('./index.html',location.href);url.hash=`quiz-${$('bannerQuizLink').value}`;$('bannerLinkUrl').value=url.href;$('bannerLinkLabel').value='Посмотреть квиз';changed();});
$('saveBanner').addEventListener('click',()=>run(async()=>{await save();status('Черновик сохранён. Посетители его не видят до публикации.');}));
$('publishBanner').addEventListener('click',()=>run(async()=>{const item=await save();await rpc('admin_publish_home_banner',{p_id:item.id,p_revision:item.revision});current.published_revision=current.revision;await list();$('bannerSaveState').textContent=`На главной · версия ${current.revision}`;status('Баннер опубликован на главной странице.');}));
$('hideBanner').addEventListener('click',()=>run(async()=>{if(!current){status('Этот баннер ещё не опубликован.');return;}await rpc('admin_hide_home_banner',{p_id:current.id,p_revision:current.revision});current.published_revision=null;await list();status('Баннер убран с главной. Черновик сохранён.');}));
$('clearBannerImage').addEventListener('click',()=>{$('bannerImageUrl').value='';$('bannerImageAlt').value='';$('bannerImageFile').value='';changed();});
$('bannerImageFile').addEventListener('change',()=>{const file=$('bannerImageFile').files?.[0];if(!file)return;void run(async()=>{const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};if(!types[file.type]||file.size>20*1024*1024)throw Error('Картинка: JPG, PNG, WebP или GIF до 20 МБ.');const path=`banners/${crypto.randomUUID()}.${types[file.type]}`;const {error}=await api.storage.from('quiz-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;const {data}=api.storage.from('quiz-media').getPublicUrl(path);$('bannerImageUrl').value=data.publicUrl;changed();status('Картинка загружена. Сохраните и опубликуйте баннер.');});});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
