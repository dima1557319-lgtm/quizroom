// In-memory PostgreSQL; no network calls or production credentials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const dependency=name=>process.env.QUIZROOM_TEST_MODULES
 ? import(pathToFileURL(`${process.env.QUIZROOM_TEST_MODULES}/${name==='linkedom'?'linkedom/esm/index.js':'@electric-sql/pglite/dist/index.js'}`)) : import(name);
const {PGlite}=await dependency('@electric-sql/pglite');
const {parseHTML}=await dependency('linkedom');
const read=name=>readFile(new URL(`./${name}`,import.meta.url),'utf8');
for(const file of ['player.js','player-controls.js','game-view.js','rich-game.js','game-summary.js','room-test.html','player.html']){
 const source=await read(file);
 const scripts=file.endsWith('.html')?[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]):[source];
 for(const script of scripts){const check=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});assert.equal(check.status,0,`${file}: ${check.stderr}`);}
}
const db=new PGlite();
process.on('uncaughtException',error=>{console.error(error.message,error.where||'');process.exit(1);});
// The pre-existing Supabase base schema is not stored in the repository.
// Reproduce that contract; load actual game functions below unchanged.
await db.exec(`
 create role anon;create role authenticated;
 create schema realtime;
 create function realtime.send(jsonb,text,text,boolean) returns void language sql as 'select';
 create table rooms(id uuid primary key default gen_random_uuid(),code text unique not null,host_token uuid not null default gen_random_uuid(),status text not null default 'waiting',max_players int not null default 20,current_question int not null default 0,lobby_topic uuid not null default gen_random_uuid());
 create table players(id uuid primary key default gen_random_uuid(),room_id uuid references rooms(id),name text,player_token uuid not null default gen_random_uuid(),joined_at timestamptz not null default clock_timestamp(),score numeric not null default 0 check(score>=0));
 create table questions(id uuid primary key default gen_random_uuid(),room_id uuid references rooms(id),question_number int,question_text text,options jsonb,correct_option int,duration int,unique(room_id,question_number));
 create table answers(id uuid primary key default gen_random_uuid(),question_id uuid references questions(id),player_id uuid references players(id),selected_option int,points_awarded numeric,answered_at timestamptz default clock_timestamp(),unique(question_id,player_id));
 create function public.create_quiz_room() returns table(room_code text,host_secret uuid) language plpgsql set search_path='public' as $$begin return query insert into rooms(code) values(lpad((select count(*)+1 from rooms)::text,6,'0')) returning code,host_token;end$$;
 create function public.join_quiz_room(p_code text,p_name text) returns table(player_id uuid,player_secret uuid,room_code text,player_name text) language plpgsql set search_path='public' as $$declare r rooms%rowtype;begin
 select * into strict r from rooms where code=p_code for update;
 if (select count(*) from players where room_id=r.id)>=r.max_players then raise exception 'Комната заполнена';end if;
 return query insert into players(room_id,name) values(r.id,p_name) returning id,player_token,r.code,name;end$$;
`);
await db.exec(await read('game.sql'));
await db.exec(await read('scoring-access.sql'));
const studio=await read('admin-studio.sql');
await db.exec(studio.slice(studio.indexOf('alter table public.quiz_templates'),studio.indexOf('create or replace function public.is_quiz_admin')));
await db.exec(`create function public.is_quiz_admin() returns boolean language sql as 'select false';`);
await db.exec(studio.slice(studio.indexOf('create or replace function public.create_quiz_room_v2'),studio.indexOf('-- Only administrators can upload.')));
await db.exec(await read('game-reliability.sql'));
await db.exec(await read('no-host.sql'));
await db.exec(await read('no-host.sql')); // Safe to apply twice.
if(process.env.QUIZROOM_CLASSIC_TEST){
 await db.exec(`create table public.admin_quizzes(id uuid primary key default gen_random_uuid(),template_key text unique,draft jsonb,revision integer default 1,published_revision integer);`);
 await db.exec(studio.slice(studio.indexOf('create or replace function public.validate_quiz_document'),studio.indexOf('create or replace function public.admin_list_quizzes')));
 await db.exec(studio.slice(studio.indexOf('create or replace function public.admin_publish_quiz'),studio.indexOf('create or replace function public.admin_unpublish_quiz')));
 await db.exec(studio.slice(studio.indexOf('create or replace function public.list_quiz_catalog'),studio.indexOf('create or replace function public.create_quiz_room_v2')));
 await db.exec(await read('classic-game.sql'));await db.exec(await read('classic-game.sql'));
}
await db.exec(await read('game-reliability-tests.sql')); // Hosted regression.
await db.exec(await read('no-host-tests.sql'));
if(process.env.QUIZROOM_CLASSIC_TEST){await db.exec(await read('classic-tests.sql'));console.log('PASS: classic server tests');}
console.log('PASS: PostgreSQL migration twice, hosted regression, everyone gameplay/security/recovery');
await db.close();

const {document}=parseHTML(await read('player.html'));
globalThis.document=document;
globalThis.location={href:'https://example.test/quizroom/player.html'};
const qrCalls=[];
globalThis.QRCode=class {constructor(element,options){qrCalls.push(options);}};
const {renderEveryoneControls}=await import('./player-controls.js');
const byId=id=>document.getElementById(id);
const base={play_mode:'everyone',room_code:'123456',players:[{player_name:'Аня'}],status:'waiting',can_control:true,controller_name:'Аня'};
renderEveryoneControls(base);
assert.equal(byId('everyoneStart').hidden,false);
assert.equal(byId('everyoneNext').hidden,true);
assert.equal(byId('inviteRoom').hidden,false);
assert.equal(qrCalls[0].text,'https://example.test/quizroom/join.html?code=123456');
renderEveryoneControls({...base,status:'playing',phase:'question'});
assert.equal(byId('everyoneStart').hidden,true);assert.equal(byId('everyoneNext').hidden,true);
renderEveryoneControls({...base,status:'playing',phase:'reveal',question:{number:1,round_end:true},total_questions:2});
assert.equal(byId('everyoneNext').hidden,false);assert.equal(byId('everyoneNext').textContent,'Начать следующий тур');
renderEveryoneControls({...base,status:'playing',phase:'reveal',question:{number:2},total_questions:2},true);
assert.equal(byId('everyoneNext').textContent,'Показать итоги');assert.equal(byId('everyoneNext').disabled,true);
renderEveryoneControls({...base,can_control:false,controller_name:'<img src=x onerror=alert(1)>'});
assert.equal(byId('everyoneStart').hidden,true);assert.equal(byId('organizerStatus').querySelector('img'),null);
renderEveryoneControls({...base,status:'finished'});assert.equal(byId('everyoneNext').hidden,true);
renderEveryoneControls({...base,play_mode:'hosted'});assert.equal(byId('everyoneControls').hidden,true);
console.log('PASS: player controls, QR URL, turn boundaries, final results, pending state, safe names, hosted UI');
