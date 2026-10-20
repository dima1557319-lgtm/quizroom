import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {parseHTML}=await import(pathToFileURL((process.env.QUIZROOM_TEST_MODULES||'./node_modules')+'/linkedom/esm/index.js'));
const html=await readFile('join.html','utf8');const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import .*?;/s,'');
async function run(result){const {document,window}=parseHTML(html);let target=null;const store=new Map();const storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};window.location={search:'?code=123456',replace:v=>target=v,assign:v=>target=v};let calls=0;new Function('document','window','sessionStorage','gameRpc',source)(document,window,storage,async()=>{calls++;return result;});document.getElementById('playerName').value='Проверка';document.getElementById('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));return {document,store,target,calls};}
let r=await run({data:null,error:{code:'NETWORK_TIMEOUT',message:'timeout'}});assert.equal(r.document.getElementById('joinBtn').disabled,false);assert.match(r.document.getElementById('status').textContent,/12 секунд/);assert.equal(r.store.size,0);
r=await run({data:[{player_id:'undefined',player_secret:'undefined'}],error:null});assert.equal(r.target,null);assert.equal(r.store.size,0);assert.match(r.document.getElementById('status').textContent,/данные доступа/);
r=await run({data:[{player_id:'11111111-1111-1111-1111-111111111111',player_secret:'22222222-2222-2222-2222-222222222222',player_name:'Проверка'}],error:null});assert.equal(r.target,'./player.html');assert.equal(r.store.get('quizroom_player_room'),'123456');
console.log('PASS: join timeout recovery, invalid credential rejection and successful player redirect');
