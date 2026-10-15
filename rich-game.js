import {renderMedia} from './quiz-media.js?v=studio1';
let key;
const make=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
function answerText(q){if(q.correct_choices?.length)return q.correct_choices.map(i=>q.options?.[i]).filter(Boolean).join('; ');if(q.accepted?.length)return q.accepted.join('; ');return 'Оценка ведущего';}
export function renderRichGame(data,onAnswer){
 const q=data.question,finished=data.status==='finished';
 document.getElementById('game').hidden=data.status==='waiting';
 document.getElementById('roundTitle').textContent=finished?'Игра завершена — итоговые результаты':`${q.round||'Тур'} · Вопрос ${q.number} из ${data.total_questions} · Баллы: ${q.points}`;
 document.getElementById('questionText').textContent=finished?'Спасибо за игру!':q.text;
 document.getElementById('answerStatus').textContent=finished?'Итоги игры':data.phase==='reveal'?(q.revealed?`Правильный ответ: ${answerText(q)}`:'Ответы сохранены. Разбор будет позже по правилам квиза.'):data.my_response!=null?'Ответ принят. Ожидаем ведущего.':`Ответили: ${data.answer_count} из ${data.players.length}`;
 const nextKey=JSON.stringify([q.id,data.phase,data.my_response,q.revealed,finished,!!onAnswer,data.review]);if(key===nextKey)return;key=nextKey;
 const target=document.getElementById('options');target.replaceChildren();
 if(!finished){
  const media=make('div');renderMedia(q.media,media);target.append(media);
  if(q.animation==='fade')target.classList.add('question-fade');else target.classList.remove('question-fade');
  if(onAnswer){
   const form=make('form');
   if(['single','multiple'].includes(q.kind)){
    q.options.forEach((value,i)=>{const label=make('label');label.className='option';const input=make('input');input.type=q.kind==='single'?'radio':'checkbox';input.name='quiz-choice';input.value=String(i);input.dataset.richAnswer='true';input.checked=data.my_response?.choices?.includes(i)||false;label.append(input,document.createTextNode(' '+value));if(q.correct_choices?.includes(i))label.classList.add('correct');form.append(label);});
   }else{const label=make('label','Ваш ответ');const text=make('textarea');text.maxLength=500;text.required=true;text.value=data.my_response?.text||'';text.dataset.richAnswer='true';label.append(text);form.append(label);}
   const button=make('button','Отправить ответ');button.type='submit';button.dataset.richAnswer='true';form.append(button);
   form.addEventListener('submit',e=>{e.preventDefault();if(data.phase!=='question'||data.my_response!=null)return;const response=['single','multiple'].includes(q.kind)?{choices:[...form.querySelectorAll('input:checked')].map(i=>Number(i.value))}:{text:form.querySelector('textarea').value.trim()};if(response.choices&&!response.choices.length)return;void onAnswer(q.id,response);});target.append(form);
  }else if(q.options?.length){const list=make('ol');q.options.forEach((value,i)=>{const li=make('li',value);if(q.correct_choices?.includes(i))li.className='correct';list.append(li);});target.append(list);}else target.append(make('p',q.kind==='manual'?'Игроки отвечают текстом; оценка ведущим.':'Игроки вводят ответ текстом.'));
  if(q.revealed){target.append(make('p',q.explanation||''));const media=make('div');renderMedia(q.answer_media,media);target.append(media);}
 }
 if(data.review?.length){const title=make('h3','Разбор ответов');target.append(title);for(const item of data.review){const section=make('section');section.append(make('h4',`${item.number}. ${item.text}`),make('p',answerText(item)),make('p',item.explanation||''));const media=make('div');renderMedia(item.answer_media,media);section.append(media);target.append(section);}}
}
