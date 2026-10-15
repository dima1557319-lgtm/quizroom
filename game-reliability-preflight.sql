begin;
alter table public.rooms add column if not exists game_title text;
alter table public.rooms add column if not exists finished_at timestamptz;
alter table public.rooms add column if not exists finish_reason text;
alter table public.rooms add column if not exists game_result jsonb;
update public.rooms r set game_title=coalesce(r.admin_document->>'title',t.title) from public.quiz_templates t where r.quiz_key=t.key and r.game_title is null;
update public.rooms set finished_at=clock_timestamp(),finish_reason='completed' where status='finished' and finished_at is null;
do $$begin
 if to_regprocedure('public.quiz_game_snapshot_content(uuid,uuid)') is null then alter function public.quiz_game_snapshot(uuid,uuid) rename to quiz_game_snapshot_content;end if;
 if to_regprocedure('public.control_quiz_game_content(text,uuid,text,jsonb,uuid,text)') is null then alter function public.control_quiz_game_v2(text,uuid,text,jsonb,uuid,text) rename to control_quiz_game_content;end if;
 if to_regprocedure('public.join_quiz_room_content(text,text)') is null then alter function public.join_quiz_room(text,text) rename to join_quiz_room_content;end if;
end $$;
revoke all on function public.quiz_game_snapshot_content(uuid,uuid),public.control_quiz_game_content(text,uuid,text,jsonb,uuid,text),public.join_quiz_room_content(text,text) from public,anon,authenticated;
create or replace function public.quiz_result_report(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; standings jsonb;
begin
 select * into strict r from public.rooms where id=p_room;
 if r.status<>'finished' then raise exception 'Игра ещё не завершена';end if;
 select coalesce(jsonb_agg(jsonb_build_object('rank',place,'player_name',name,'score',score) order by score desc,joined_at,id),'[]') into standings from (select p.*,rank() over(order by score desc) as place from public.players p where room_id=r.id) ranked;
 return jsonb_build_object('version',1,'room_code',r.code,'quiz_title',coalesce(r.game_title,r.admin_document->>'title','QuizRoom'),'finished_at',r.finished_at,'finish_reason',r.finish_reason,'question_count',(select count(*) from public.questions where room_id=r.id),'players',standings);
end $$;
revoke all on function public.quiz_result_report(uuid) from public,anon,authenticated;
update public.rooms set game_result=public.quiz_result_report(id) where status='finished' and game_result is null;
create or replace function public.quiz_game_snapshot(p_room uuid,p_player uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;r public.rooms%rowtype;q public.questions%rowtype;nextq public.questions%rowtype;
begin
 result:=public.quiz_game_snapshot_content(p_room,p_player);select * into strict r from public.rooms where id=p_room;
 select * into q from public.questions where room_id=r.id and question_number=r.current_question;
 select * into nextq from public.questions where room_id=r.id and question_number=r.current_question+1;
 result:=result||jsonb_build_object('quiz_title',coalesce(r.game_title,r.admin_document->>'title',(select title from public.quiz_templates where key=r.quiz_key),'QuizRoom'),'score_timing',r.admin_document->>'score_timing','reveal_timing',r.admin_document->>'reveal_timing','next_round_title',case when nextq.id is not null and nextq.definition->>'round_number' is distinct from q.definition->>'round_number' then nextq.definition->>'round' else null end,'results',case when r.status='finished' then coalesce(r.game_result,public.quiz_result_report(r.id)) else null end);
 return result;
end $$;
revoke all on function public.quiz_game_snapshot(uuid,uuid) from public,anon,authenticated;
create or replace function public.join_quiz_room(p_code text,p_name text) returns table(player_id uuid,player_secret uuid,room_code text,player_name text) language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;
begin
 select * into r from public.rooms where code=p_code for update;
 if not found then raise exception 'Комната не найдена';end if;
 if r.status<>'waiting' then raise exception 'Игра уже началась. Вернитесь через файл доступа, если вы уже подключались';end if;
 return query select * from public.join_quiz_room_content(p_code,p_name);
end $$;
revoke all on function public.join_quiz_room(text,text) from public;
grant execute on function public.join_quiz_room(text,text) to anon,authenticated;
create or replace function public.control_quiz_game_v2(p_code text,p_host_secret uuid,p_action text,p_questions jsonb default null,p_question_id uuid default null,p_scoring_mode text default 'reveal') returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; after_game public.rooms%rowtype; ignored jsonb; reason text;
begin
 select * into r from public.rooms where code=p_code and host_token=p_host_secret for update;
 if not found then raise exception 'Нет доступа ведущего' using errcode='42501';end if;
 if r.game_title is null then update public.rooms set game_title=coalesce(r.admin_document->>'title',(select title from public.quiz_templates where key=r.quiz_key),'QuizRoom') where id=r.id;end if;
 ignored:=public.control_quiz_game_content(p_code,p_host_secret,p_action,p_questions,p_question_id,p_scoring_mode);
 select * into after_game from public.rooms where id=r.id;
 if after_game.status='finished' and after_game.game_result is null then
  reason:=case when p_action='next' or (r.game_phase='reveal' and not exists(select 1 from public.questions where room_id=r.id and question_number>r.current_question)) then 'completed' else 'ended_by_host' end;
  update public.rooms set finished_at=coalesce(finished_at,clock_timestamp()),finish_reason=coalesce(finish_reason,reason) where id=r.id;
  update public.rooms set game_result=public.quiz_result_report(r.id) where id=r.id;
 end if;
 return public.quiz_game_snapshot(r.id,null);
end $$;
revoke all on function public.control_quiz_game_v2(text,uuid,text,jsonb,uuid,text) from public;
grant execute on function public.control_quiz_game_v2(text,uuid,text,jsonb,uuid,text) to anon,authenticated;

do $$
declare uid uuid:=gen_random_uuid();saved jsonb;doc jsonb;c record;p record;s jsonb;ps jsonb;qid uuid;aid uuid;timing text;i int;score numeric;opts jsonb;
begin
 if has_table_privilege('anon','public.admin_quizzes','SELECT') or has_table_privilege('authenticated','public.quiz_admin_emails','SELECT') or has_function_privilege('anon','public.quiz_game_snapshot(uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.control_quiz_game_legacy(text,uuid,text,jsonb,uuid,text)','EXECUTE') then raise exception 'FAIL private permissions';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.admin_list_quizzes();raise exception 'FAIL unauthorized list';exception when insufficient_privilege then null;end;
 begin perform public.create_quiz_room_v2('custom');raise exception 'FAIL public custom';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 insert into auth.users(id,email,email_confirmed_at) values(uid,'quizroom-rollback-test@example.invalid',now());
 insert into public.quiz_admins(user_id) values(uid);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 if not public.is_quiz_admin() then raise exception 'FAIL admin authentication';end if;
 insert into public.quiz_admin_emails(email_hash) values(encode(extensions.digest('quizroom-rollback-test@example.invalid','sha256'),'hex'));
 delete from public.quiz_admins where user_id=uid;
 if not public.is_quiz_admin() then raise exception 'FAIL verified email access';end if;
 update auth.users set email_confirmed_at=null where id=uid;
 if public.is_quiz_admin() then raise exception 'FAIL unverified email access';end if;
 update auth.users set email_confirmed_at=now() where id=uid;
 doc:='{"title":"Rollback test","description":"Private test","category":"Test","price":123.5,"score_timing":"question","reveal_timing":"question","rounds":[{"title":"Round 1","questions":[{"text":"Single","kind":"single","options":["A","B"],"correct":[1],"points":0.5,"duration":300},{"text":"Multiple","kind":"multiple","options":["A","B","C","D","E"],"correct":[0,4],"partial":true,"points":1,"duration":300}]},{"title":"Round 2","questions":[{"text":"Text","kind":"text","accepted":["Ёж  лесной"],"points":1.5,"duration":300},{"text":"Manual","kind":"manual","points":1.5,"duration":300}]}]}'::jsonb;
 foreach timing in array array['question','round','quiz'] loop
  doc:=jsonb_set(jsonb_set(doc,'{score_timing}',to_jsonb(timing)),'{reveal_timing}',to_jsonb(timing));
  saved:=public.admin_save_quiz(null,doc,0);
  begin perform public.admin_save_quiz((saved->>'id')::uuid,doc,0);raise exception 'FAIL revision';exception when serialization_failure then null;end;
  perform public.admin_publish_quiz((saved->>'id')::uuid,1);
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.create_quiz_room_v2(saved->>'template_key');raise exception 'FAIL paid bypass';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  select * into c from public.create_quiz_room_v2(saved->>'template_key');
  select * into p from public.join_quiz_room(c.room_code,'Rollback player');
  s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'start',null,null,'reveal');
  if s->'question'->>'text'<>'Single' or (s->>'can_edit_content')::boolean then raise exception 'FAIL start/editor';end if;
  for i in 1..4 loop
   qid:=(s->'question'->>'id')::uuid;
   ps:=public.get_quiz_game_player(p.player_id,p.player_secret);
   if ps->'question'->>'correct_option' is not null or ps->'question'->>'correct_choices' is not null or ps->'question'->>'accepted' is not null then raise exception 'FAIL answer leakage';end if;
   opts:=case i when 1 then '{"choices":[1]}'::jsonb when 2 then '{"choices":[4]}' when 3 then '{"text":"еж лесной"}' else '{"text":"Manual response"}' end;
   perform public.submit_quiz_response(p.player_id,p.player_secret,qid,opts);
   perform public.submit_quiz_response(p.player_id,p.player_secret,qid,opts);
   if i=4 then
    select id into aid from public.answers where player_id=p.player_id and question_id=qid;
    begin perform public.grade_quiz_response(c.room_code,p.player_secret,aid,1);raise exception 'FAIL player grading';exception when insufficient_privilege then null;end;
    begin perform public.grade_quiz_response(c.room_code,c.host_secret,aid,2);raise exception 'FAIL excess grading';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
    perform public.grade_quiz_response(c.room_code,c.host_secret,aid,0.5);
   end if;
   s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'reveal',null,qid,'reveal');
   score:=(s->'players'->0->>'score')::numeric;
   if timing='quiz' and score<>0 then raise exception 'FAIL quiz score timing';end if;
   if timing='round' and score<>(case when i=1 then 0 when i<4 then 1 else 3 end) then raise exception 'FAIL round score timing % %',i,score;end if;
   if timing='question' and score<>(case i when 1 then .5 when 2 then 1 when 3 then 2.5 else 3 end) then raise exception 'FAIL question score timing';end if;
   if timing='quiz' and (s->'question'->>'revealed')::boolean then raise exception 'FAIL early quiz reveal';end if;
   if timing='round' and i in (1,3) and (s->'question'->>'revealed')::boolean then raise exception 'FAIL early round reveal';end if;
   s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'next',null,qid,'reveal');
  end loop;
  if s->>'status'<>'finished' or (s->'players'->0->>'score')::numeric<>3 then raise exception 'FAIL final score';end if;
  perform public.admin_unpublish_quiz((saved->>'id')::uuid);
 end loop;
end $$;
do $$
declare c record;p record;s jsonb;r jsonb;qid uuid;i int;blocked boolean;before_result jsonb;
begin
 perform set_config('request.jwt.claim.sub','',true);
 if has_function_privilege('anon','public.quiz_result_report(uuid)','EXECUTE') or has_function_privilege('anon','public.control_quiz_game_content(text,uuid,text,jsonb,uuid,text)','EXECUTE') or has_function_privilege('anon','public.join_quiz_room_content(text,text)','EXECUTE') then raise exception 'FAIL private helpers';end if;
 select * into c from public.create_quiz_room_v2('starter');
 begin perform public.control_quiz_game_v2(c.room_code,c.host_secret,'start',null,null,'reveal');raise exception 'FAIL empty start';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 for i in 1..20 loop select * into p from public.join_quiz_room(c.room_code,'Проверка '||i);end loop;
 begin perform public.join_quiz_room(c.room_code,'21-й');raise exception 'FAIL capacity';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 if (select count(*) from public.players pl join public.rooms ro on ro.id=pl.room_id where ro.code=c.room_code)<>20 then raise exception 'FAIL room size';end if;
 begin perform public.get_quiz_game_host(c.room_code,p.player_secret);raise exception 'FAIL player host access';exception when insufficient_privilege then null;end;
 s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'start',null,null,'reveal');qid:=(s->'question'->>'id')::uuid;
 if s->'results'<>'null'::jsonb then raise exception 'FAIL early results';end if;
 begin perform public.join_quiz_room(c.room_code,'После старта');raise exception 'FAIL late join';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 update public.rooms set question_started_at=clock_timestamp()-interval '400 seconds' where code=c.room_code;
 begin perform public.submit_quiz_answer(p.player_id,p.player_secret,qid,2);raise exception 'FAIL expired answer';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 update public.rooms set question_started_at=clock_timestamp() where code=c.room_code;
 perform public.submit_quiz_answer(p.player_id,p.player_secret,qid,2);perform public.submit_quiz_answer(p.player_id,p.player_secret,qid,1);
 if (select count(*) from public.answers where player_id=p.player_id and question_id=qid)<>1 then raise exception 'FAIL duplicate answer';end if;
 s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'reveal',null,qid,'reveal');s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'next',null,qid,'reveal');
 s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'next',null,qid,'reveal');if (s->'question'->>'number')::int<>2 then raise exception 'FAIL double next';end if;
 qid:=(s->'question'->>'id')::uuid;s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'finish',null,qid,'reveal');
 if s->>'status'<>'finished' or s->'results'->>'finish_reason'<>'ended_by_host' or jsonb_array_length(s->'results'->'players')<>20 or (s->'results'->'players'->0->>'score')::numeric<>1 then raise exception 'FAIL results';end if;
 r:=public.get_quiz_game_player(p.player_id,p.player_secret);if r->'results' is distinct from s->'results' then raise exception 'FAIL result recovery';end if;
 if (s->'results')::text like '%secret%' or (s->'results')::text like '%token%' then raise exception 'FAIL credentials in result';end if;
 before_result:=s->'results';s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'finish',null,qid,'reveal');if s->'results' is distinct from before_result then raise exception 'FAIL result mutated';end if;
end $$;
rollback;
select 'PASS: capacity 20, late joins, deadlines, role isolation, retries, stale actions, stable results and recovery' as result;
