import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {classicTemplate,newestClassic} from './classic-document.js?v=hints1';
import {validateQuiz,importQuiz} from './studio-document.js?v=hints1';
import {ClassicPreview} from './classic-preview.js?v=hints1';
import {renderClassic,resetClassicView} from './classic-view.js?v=hints1';
const {parseHTML}=await import(pathToFileURL(process.env.QUIZROOM_TEST_MODULES+'/linkedom/esm/index.js'));
const doc=classicTemplate(false);doc.rounds[0].questions=[{id:'hint-q',text:'Вопрос?',kind:'text',accepted:['ответ'],points:2,duration:5,partial:false,hints:['Первый намёк','<img src=x onerror=alert(1)>','Последний намёк']}];
assert.deepEqual(validateQuiz(doc),[]);assert.deepEqual(importQuiz({format:'quizroom-quiz',version:2,document:doc}).rounds[0].questions[0].hints,doc.rounds[0].questions[0].hints);
for(const bad of [[],[''],['a','b','c','d'],[null]]){const broken=structuredClone(doc);broken.rounds[0].questions[0].hints=bad;assert.equal(validateQuiz(broken).length>0,bad.length>0);}
for(const change of [{points:1},{partial:true}]){const broken=structuredClone(doc);Object.assign(broken.rounds[0].questions[0],change);assert.ok(validateQuiz(broken).length);}
for(const total of [1,2,3])for(let used=0;used<=total;used++)for(const outcome of ['correct','wrong','blank']){
 const d=structuredClone(doc);d.rounds[0].questions[0].hints=d.rounds[0].questions[0].hints.slice(0,total);let now=Date.now();const m=new ClassicPreview(d,()=>now);let s=m.request('classic_action',{p_action:'advance',p_version:1});assert.equal(s.classic.questions[0].hints.length,0);
 for(let n=1;n<=used;n++){s=m.request('classic_use_hint',{p_question_id:'hint-q',p_hint_no:n});m.request('classic_use_hint',{p_question_id:'hint-q',p_hint_no:n});assert.equal(s.classic.questions[0].hints.length,n);}
 if(used<total&&used+2<=total)assert.throws(()=>m.request('classic_use_hint',{p_question_id:'hint-q',p_hint_no:used+2}));
 if(outcome!=='blank')m.request('classic_save_response',{p_question_id:'hint-q',p_response:{text:outcome==='correct'?'ответ':'нет'},p_stake:0,p_revision:0});
 now+=6000;m.tick();m.request('classic_action',{p_action:'advance',p_version:m.version});s=m.request('classic_submit_round',{p_round:1});assert.equal(s.players[0].score,outcome==='correct'?2-used*.5:0);
}
const {document,window}=parseHTML(await readFile('player.html','utf8'));globalThis.document=document;globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
const m=new ClassicPreview(doc);let state=m.request('classic_action',{p_action:'advance',p_version:1});resetClassicView();const request=async(name,args)=>m.request(name,args);renderClassic(state,request);
const input=document.querySelector('#classicGame textarea');input.value='мой черновик';input.dispatchEvent(new window.Event('input',{bubbles:true}));document.querySelector('[data-use-hint]').click();await new Promise(r=>setTimeout(r,0));
assert.equal(document.querySelector('#classicGame textarea').value,'мой черновик');assert.match(document.querySelector('.classic-hints strong').textContent,/1,5/);assert.match(document.querySelector('.classic-hint-open').textContent,/Первый намёк/);assert.ok(!document.querySelector('.classic-hints').textContent.includes('Последний намёк'));
document.querySelector('[data-use-hint]').click();await new Promise(r=>setTimeout(r,0));assert.equal(document.querySelectorAll('.classic-hint-open img').length,0);assert.match(document.querySelectorAll('.classic-hint-open')[1].textContent,/<img/);
const fresh=m.snapshot();const merged=newestClassic(fresh,state);assert.equal(merged.classic.questions[0].hints_used,2);
console.log('PASS: paid hints import/validation, all 1–3 hint payouts, wrong/blank, sequential/idempotent reveal, private text, escaped markup, unsaved answers preserved, stale snapshots');process.exit(0);
