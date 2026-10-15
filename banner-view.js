const el=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
const labels={announcement:'Новый квиз',information:'Информация',advertisement:'Реклама'};
function https(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
export function renderBanners(target,items){
 target.replaceChildren();
 for(const item of items){
  const card=el('article');card.className=`digest-card digest-${['announcement','information','advertisement'].includes(item.kind)?item.kind:'information'}`;
  const src=https(item.image_url);
  if(src){const img=el('img');img.src=src;img.alt=item.image_alt||'';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});card.append(img);}
  const body=el('div');body.className='digest-body';const badge=el('span',labels[item.kind]||'Информация');badge.className='digest-badge';body.append(badge,el('h3',item.title||'Заголовок баннера'));
  if(item.text)body.append(el('p',item.text));
  const href=https(item.link_url);if(href){const link=el('a',item.link_label||'Подробнее');link.className='primary small';link.href=href;link.rel='noopener noreferrer';body.append(link);}
  card.append(body);target.append(card);
 }
}
