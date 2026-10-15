export function renderMedia(media,target){
 target.replaceChildren();if(!media?.url)return;
 let url;try{url=new URL(media.url);if(url.protocol!=='https:')return;}catch{return;}
 let node;
 if(media.type==='image'){node=document.createElement('img');node.alt=media.alt||'Изображение к вопросу';node.loading='lazy';}
 else if(['audio','video'].includes(media.type)){node=document.createElement(media.type);node.controls=true;node.preload='metadata';}
 else return;
 node.src=url.href;node.className='quiz-media';node.referrerPolicy='no-referrer';target.append(node);
}
