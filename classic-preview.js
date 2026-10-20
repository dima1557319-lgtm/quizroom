import {stakePolicy} from './classic-document.js?v=classic3';
import {renderClassic,resetClassicView} from './classic-view.js?v=classic4';
export class ClassicPreview {
 constructor(document,now=()=>Date.now()){this.doc=structuredClone(document);this.now=now;this.round=0;this.cursor=0;this.phase='intro';this.version=1;this.deadline=null;this.drafts=[];this.awards=[];this.submitted=false;}
 get rules(){return this.doc.rounds[this.round].rules;}
 get questions(){let number=0;return this.doc.rounds.flatMap((r,ri)=>r.questions.map(q=>({...q,round:ri,number:++number})));}
 set(phase,seconds=null){this.phase=phase;this.deadline=seconds==null?null:this.now()+seconds*1000;this.version++;}
 open(number){this.cursor=number;const q=this.questions.find(q=>q.number===number);this.set(this.rules.media_clock==='after_media'&&['audio','video'].includes(q.media?.type)?'media_wait':'question',this.rules.media_clock==='after_media'&&['audio','video'].includes(q.media?.type)?q.media_end-q.media_start:q.duration);}
 freeze(qid=null){for(const q of this.questions.filter(q=>q.round===this.round&&(!qid||q.id===qid))){if(this.awards.some(a=>a.question_id===q.id))continue;const d=this.drafts.find(d=>d.question_id===q.id);let base=0,correct=false;
  if(d?.response){if(q.kind==='text'){const normalize=v=>{const s=v.trim().replace(/\s+/g,' ');return q.case_sensitive?s:s.toLowerCase().replaceAll('ё','е');};correct=q.accepted.some(a=>normalize(a)===normalize(d.response.text));base=correct?Number(q.points):0;}else{const chosen=d.response.choices||[],hits=chosen.filter(i=>q.correct.includes(i)).length,misses=chosen.length-hits;correct=misses===0&&hits===q.correct.length;base=q.partial?Number(q.points)*Math.max(0,hits-misses)/q.correct.length:correct?Number(q.points):0;}}
  const policy=stakePolicy(this.rules,d?.stake||0);const points=!d?.response?0:correct?base+policy.correct_bonus:d.stake?policy.wrong:base+policy.wrong;this.awards.push({question_id:q.id,round:q.round,points:Math.round(points*100)/100,stake:d?.stake||0,correct,visible:this.rules.score_timing==='question'});if(d)d.locked=true;
 }}
 close(){this.freeze();if(this.rules.score_timing==='round')for(const a of this.awards)if(a.round===this.round)a.visible=true;this.set('review');}
 next(){const q=this.questions.find(q=>q.number===this.cursor+1&&q.round===this.round);if(q)this.open(q.number);else if(this.rules.repeat)this.set('repeat',this.rules.repeat_seconds);else if(this.rules.submission==='round')this.set('submit',this.rules.submit_seconds);else this.close();}
 tick(){if(this.deadline==null||this.now()<this.deadline)return;
  if(this.phase==='question'){if(this.rules.submission==='question')this.freeze(this.questions.find(q=>q.number===this.cursor).id);this.set(this.rules.submission==='question'&&this.rules.reveal_timing==='question'?'answer':'question_done');if(this.rules.transition==='auto'&&this.phase!=='answer')this.next();}
  else if(this.phase==='repeat'){if(this.rules.submission==='round')this.set('submit',this.rules.submit_seconds);else this.close();}
  else if(this.phase==='submit')this.close();else if(this.phase==='break'){this.round++;this.submitted=false;this.set('intro');}}
 request(name,args){this.tick();if(name==='classic_save_response'){
  const q=this.questions.find(q=>q.id===args.p_question_id),d=this.drafts.find(d=>d.question_id===q?.id);if(!q||q.round!==this.round||q.number>this.cursor||this.submitted||d?.locked||!['question','question_done','repeat','submit'].includes(this.phase))throw Error('Приём ответов закрыт');
  if(this.rules.submission==='question'&&(this.phase!=='question'||q.number!==this.cursor))throw Error('Вопрос закрыт');
  if(args.p_revision!==(d?.revision||0))throw Error('Версия ответа изменилась');
  if(!this.rules.stakes.includes(args.p_stake))throw Error('Недопустимая ставка');
  const updated={question_id:q.id,response:args.p_response,stake:args.p_response?args.p_stake:0,revision:(d?.revision||0)+1,locked:this.rules.submission==='question'};if(d)Object.assign(d,updated);else this.drafts.push(updated);
  if(this.rules.submission==='question'){this.freeze(q.id);this.set(this.rules.reveal_timing==='question'?'answer':'question_done');if(this.rules.transition==='auto'&&this.phase!=='answer')this.next();}
 }else if(name==='classic_submit_round'){if(args.p_round!==this.round+1||!['repeat','submit'].includes(this.phase))throw Error('Сдать бланк можно после всех вопросов');this.submitted=true;this.close();
 }else if(name==='classic_action'){
  if(args.p_version!==this.version)return this.snapshot();
  if(args.p_action==='media_ready'){if(this.phase!=='media_wait'||this.now()<this.deadline)throw Error('Дождитесь медиа');this.set('question',this.questions.find(q=>q.number===this.cursor).duration);}
  else if(args.p_action==='advance'){if(this.phase==='intro')this.open(this.questions.find(q=>q.round===this.round).number);else if(['question_done','answer'].includes(this.phase))this.next();else if(this.phase==='review')this.set('round_results');else if(this.phase==='round_results'){if(this.round===this.doc.rounds.length-1){for(const a of this.awards)a.visible=true;this.set('finished');}else if(this.rules.break_manual||this.rules.break_seconds)this.set('break',this.rules.break_manual?null:this.rules.break_seconds);else{this.round++;this.submitted=false;this.set('intro');}}else if(this.phase==='break'){this.round++;this.submitted=false;this.set('intro');}else throw Error('Дождитесь завершения этапа');}
 }return this.snapshot();}
 snapshot(){const finished=this.phase==='finished',closed=['review','round_results','break','finished'].includes(this.phase);const qs=this.questions.filter(q=>(q.round===this.round||finished)&&this.phase!=='intro'&&q.number<=this.cursor).map(q=>{const revealed=finished||closed&&this.rules.reveal_timing!=='quiz'||this.rules.submission==='question'&&this.rules.reveal_timing==='question'&&(q.number<this.cursor||this.phase==='answer');return {id:q.id,text:q.text,rules:finished?this.doc.rounds[q.round].rules:null,number:q.number,kind:q.kind,options:q.options,points:q.points,duration:q.duration,animation:q.animation,difficulty:q.difficulty,media:q.media,media_start:q.media_start,media_end:q.media_end,revealed,answer:revealed?{choices:q.correct,accepted:q.accepted,explanation:q.explanation,media:q.answer_media}:null};});
  const score=this.awards.filter(a=>a.visible).reduce((n,a)=>n+a.points,0),roundScores=this.doc.rounds.map((_,i)=>this.awards.filter(a=>a.visible&&a.round===i).reduce((n,a)=>n+a.points,0)).reverse();
  return {format:'classic',preview:true,room_code:'preview',quiz_title:this.doc.title,quiz_cover:this.doc.cover,play_mode:'everyone',can_control:true,status:finished?'finished':'playing',server_now:new Date(this.now()).toISOString(),players:[{player_id:'preview',player_name:'Пробный игрок',rank:1,score,round_scores:roundScores}],classic:{phase:this.phase,version:this.version,round_no:this.round+1,round_count:this.doc.rounds.length,round_title:this.doc.rounds[this.round].title,deadline:this.deadline==null?null:new Date(this.deadline).toISOString(),cursor:this.cursor,rules:this.rules.theme_hidden&&!closed?{...this.rules,theme:''}:this.rules,preflight:this.phase==='intro'?this.questions.filter(q=>q.round===this.round&&q.media).map(q=>q.media):[],questions:qs,drafts:structuredClone(this.drafts),awards:structuredClone(this.awards.filter(a=>a.visible)),submitted:this.submitted}};
 }
}
export function startClassicPreview(doc){
 let model=new ClassicPreview(doc);resetClassicView();document.getElementById('game').hidden=true;for(const id of ['previewReveal','previewNext','manualPanel'])document.getElementById(id).hidden=true;
 const draw=()=>{const data=model.snapshot();document.getElementById('previewState').textContent=doc.title+' · Проверка в браузере, данные не записываются';document.getElementById('previewScore').textContent='Пробные баллы: '+data.players[0].score;renderClassic(data,async(name,args)=>{const result=model.request(name,args);draw();return result;});};
 const restart=document.getElementById('previewRestart');restart.hidden=false;restart.onclick=()=>{model=new ClassicPreview(doc);resetClassicView();draw();};
 let version=-1;setInterval(()=>{model.tick();if(model.version!==version){version=model.version;draw();}},250);draw();
}
