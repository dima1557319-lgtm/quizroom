begin;
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
 if (select count(*) from public.quiz_templates where enabled and key<>'starter')<30 then raise exception 'FAIL legacy catalog';end if;
end $$;
rollback;
select 'PASS: authorization, private drafts, revision conflicts, paid access, four answer types, fractional scores, three score/reveal timings, manual grading, retries, catalog preserved' as result;
