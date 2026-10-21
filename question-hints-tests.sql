begin;
do $$
declare doc jsonb;rec uuid;k text;c record;pp record;rid uuid;qid uuid;s jsonb;t jsonb;ids uuid[]:='{}';secrets uuid[]:='{}';i int;j int;expected numeric;
begin
 if has_table_privilege('anon','public.classic_hint_uses','select') or has_function_privilege('anon','public.classic_hint_state(jsonb,uuid,uuid)','execute') then raise exception 'FAIL hints storage exposed';end if;
 doc:='{"schema_version":2,"format":"classic","title":"Hints test","price":0,"score_timing":"round","reveal_timing":"round","tie_break":"reverse_rounds","rounds":[{"id":"r1","title":"Hints","rules":{"submission":"round","repeat":true,"repeat_seconds":5,"submit_seconds":5,"transition":"manual","score_timing":"round","reveal_timing":"round","stakes":[0],"break_seconds":0,"break_manual":false,"media_clock":"with_question","text":"","difficulty":"Средний"},"questions":[{"id":"q1","text":"Test","kind":"text","accepted":["yes"],"points":2,"duration":5,"hints":["SECRET_ONE","SECRET_TWO","SECRET_THREE"]}]}]}';
 perform public.validate_quiz_document(doc);
 for i in 1..3 loop
  t:=jsonb_set(doc,'{rounds,0,questions,0,hints}',case i when 1 then '["a"]'::jsonb when 2 then '["a","b"]'::jsonb else '["a","b","c"]'::jsonb end);perform public.validate_quiz_document(t);
 end loop;
 begin perform public.validate_quiz_document(jsonb_set(doc,'{rounds,0,questions,0,hints}','["a","b","c","d"]'));raise exception 'FAIL fourth hint';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.validate_quiz_document(jsonb_set(doc,'{rounds,0,questions,0,hints}','[""]'));raise exception 'FAIL empty hint';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.validate_quiz_document(jsonb_set(doc,'{rounds,0,questions,0,points}','1'));raise exception 'FAIL one point';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.validate_quiz_document(jsonb_set(doc,'{rounds,0,rules,stakes}','[0,1]'));raise exception 'FAIL stakes';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 execute 'create or replace function public.is_quiz_admin() returns boolean language sql as ''select true''';
 rec:=gen_random_uuid();k:='hints-test-'||rec::text;insert into public.admin_quizzes(id,template_key,draft,revision) values(rec,k,doc,1);perform public.admin_publish_quiz(rec,1);
 execute 'create or replace function public.is_quiz_admin() returns boolean language sql as ''select false''';
 select * into c from public.create_quiz_room_everyone(k);select id into rid from public.rooms where code=c.room_code;
 for i in 1..6 loop select * into pp from public.join_quiz_room(c.room_code,'Hint player '||i);ids:=array_append(ids,pp.player_id);secrets:=array_append(secrets,pp.player_secret);end loop;
 s:=public.classic_action(ids[1],secrets[1],'start',0);s:=public.classic_action(ids[1],secrets[1],'advance',(s->'classic'->>'version')::int);qid:=(s->'classic'->'questions'->0->>'id')::uuid;
 if s::text like '%SECRET_%' or (s->'classic'->'questions'->0->>'hint_count')::int<>3 then raise exception 'FAIL unopened hints leaked';end if;
 begin perform public.classic_use_hint(ids[1],gen_random_uuid(),qid,1);raise exception 'FAIL forged access';exception when insufficient_privilege then null;end;
 begin perform public.classic_use_hint(ids[1],secrets[1],qid,2);raise exception 'FAIL skipped hint';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 for i in 2..6 loop
  for j in 1..least(i-1,3) loop s:=public.classic_use_hint(ids[i],secrets[i],qid,j);end loop;
  t:=public.classic_use_hint(ids[i],secrets[i],qid,1);
  if (t->'classic'->'questions'->0->>'hints_used')::int<>least(i-1,3) then raise exception 'FAIL duplicate charged';end if;
 end loop;
 s:=public.get_quiz_game_player(ids[2],secrets[2]);
 if s::text not like '%SECRET_ONE%' or s::text like '%SECRET_TWO%' then raise exception 'FAIL hint privacy or recovery';end if;
 s:=public.get_quiz_game_player(ids[1],secrets[1]);if s::text like '%SECRET_%' then raise exception 'FAIL another player hint leak';end if;
 for i in 1..5 loop s:=public.classic_save_response(ids[i],secrets[i],qid,jsonb_build_object('text',case when i=5 then 'wrong' else 'yes' end),0,0);end loop;
 -- Clearing/re-saving an answer cannot refund the hint purchase.
 s:=public.classic_save_response(ids[2],secrets[2],qid,null,0,1);s:=public.classic_save_response(ids[2],secrets[2],qid,'{"text":"yes"}',0,2);
 update public.rooms set classic_state=jsonb_set(classic_state,'{deadline}',to_jsonb(clock_timestamp()-interval '1 second')) where id=rid;
 s:=public.get_quiz_game_player(ids[1],secrets[1]);s:=public.classic_action(ids[1],secrets[1],'advance',(s->'classic'->>'version')::int);
 for i in 1..6 loop s:=public.classic_submit_round(ids[i],secrets[i],1);end loop;
 for i in 1..6 loop
  expected:=case when i<=4 then 2-0.5*(i-1) else 0 end;
  if (select points from public.classic_awards where player_id=ids[i] and question_id=qid)<>expected then raise exception 'FAIL hint payout player %',i;end if;
 end loop;
 -- Closed answers reject new hints; retrying an already bought hint remains idempotent.
 begin perform public.classic_use_hint(ids[1],secrets[1],qid,1);raise exception 'FAIL closed hint';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 perform public.classic_use_hint(ids[2],secrets[2],qid,1);
end $$;
rollback;
select 'PASS: 1/2/3 hint validation, privacy, authentication, sequence, idempotency, recovery, independent players, 2/1.5/1/0.5 payouts, wrong/blank 0 and closed questions' as result;
