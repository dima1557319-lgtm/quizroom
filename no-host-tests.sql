-- Run only after no-host.sql; all fixtures roll back.
begin;
do $$
declare c record;p1 record;p2 record;p record;s jsonb;before_result jsonb;rid uuid;qid uuid;oldqid uuid;i int;host uuid;mode text;
begin
 if has_function_privilege('anon','public.tick_quiz_everyone(uuid)','execute')
 or has_function_privilege('anon','public.control_quiz_game_hosted(text,uuid,text,jsonb,uuid,text)','execute')
 or has_function_privilege('anon','public.join_quiz_room_hosted(text,text)','execute') then raise exception 'FAIL helper exposed';end if;
 select * into c from public.create_quiz_room_everyone('starter');
 if to_jsonb(c)?'host_secret' then raise exception 'FAIL creator got host secret';end if;
 select id,host_token into rid,host from public.rooms where code=c.room_code;
 select * into p1 from public.join_quiz_room(c.room_code,'Первый');
 select * into p2 from public.join_quiz_room(c.room_code,'Второй');
 s:=public.get_quiz_game_player(p1.player_id,p1.player_secret);
 if s->>'can_control'<>'true' or s?'setup_questions' or s->>'play_mode'<>'everyone' then raise exception 'FAIL first controller/projection';end if;
 s:=public.get_quiz_game_player(p2.player_id,p2.player_secret);
 if s->>'can_control'<>'false' then raise exception 'FAIL second controls';end if;
 begin perform public.control_quiz_everyone(p2.player_id,p2.player_secret,'start');raise exception 'FAIL non-controller';exception when insufficient_privilege then null;end;
 begin perform public.control_quiz_everyone(p1.player_id,gen_random_uuid(),'start');raise exception 'FAIL wrong credential';exception when insufficient_privilege then null;end;
 begin perform public.get_quiz_game_host(c.room_code,host);raise exception 'FAIL host projection';exception when insufficient_privilege then null;end;
 begin perform public.control_quiz_game_v2(c.room_code,host,'start');raise exception 'FAIL host API bypass';exception when insufficient_privilege then null;end;
 begin perform public.control_quiz_game(c.room_code,host,'start');raise exception 'FAIL old host API bypass';exception when insufficient_privilege then null;end;
 s:=public.control_quiz_everyone(p1.player_id,p1.player_secret,'start');qid:=(s->'question'->>'id')::uuid;
 if s->'question'->'correct_option'<>'null'::jsonb or s?'setup_questions' then raise exception 'FAIL early key/content';end if;
 begin perform public.control_quiz_everyone(p1.player_id,p1.player_secret,'next',qid);raise exception 'FAIL early skip';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.control_quiz_everyone(p1.player_id,p1.player_secret,'reveal',qid);raise exception 'FAIL force reveal';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.join_quiz_room(c.room_code,'Поздний');raise exception 'FAIL late join';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 perform public.submit_quiz_answer(p1.player_id,p1.player_secret,qid,2);
 s:=public.get_quiz_game_player(p1.player_id,p1.player_secret);
 if s->>'phase'<>'question' then raise exception 'FAIL early close';end if;
 perform public.submit_quiz_answer(p2.player_id,p2.player_secret,qid,2);
 s:=public.get_quiz_game_player(p2.player_id,p2.player_secret);
 if s->>'phase'<>'reveal' or (s->'players'->0->>'score')::numeric<>1 then raise exception 'FAIL all answered/score';end if;
 perform public.submit_quiz_answer(p1.player_id,p1.player_secret,qid,2);
 s:=public.get_quiz_game_player(p1.player_id,p1.player_secret);
 if (s->'players'->0->>'score')::numeric<>1 then raise exception 'FAIL duplicate scores';end if;
 oldqid:=qid;
 s:=public.control_quiz_everyone(p1.player_id,p1.player_secret,'next',oldqid);
 s:=public.control_quiz_everyone(p1.player_id,p1.player_secret,'next',oldqid);
 if (s->'question'->>'number')::int<>2 then raise exception 'FAIL duplicate next';end if;
 qid:=(s->'question'->>'id')::uuid;
 update public.rooms set question_started_at=clock_timestamp()-interval '400 seconds' where id=rid;
 s:=public.get_quiz_game_player(p2.player_id,p2.player_secret);
 if s->>'phase'<>'reveal' then raise exception 'FAIL timeout closure';end if;
 -- Heartbeats do not rank by score. Earliest connected joiner succeeds owner.
 update public.players set last_seen_at=clock_timestamp()-interval '40 seconds' where id=p1.player_id;
 s:=public.get_quiz_game_player(p2.player_id,p2.player_secret);
 if s->>'can_control'<>'true' then raise exception 'FAIL transfer';end if;
 begin perform public.control_quiz_everyone(p1.player_id,p1.player_secret,'next',qid);raise exception 'FAIL former controller';exception when insufficient_privilege then null;end;
 s:=public.get_quiz_game_player(p1.player_id,p1.player_secret);
 if s->>'can_control'<>'false' then raise exception 'FAIL reconnect steals control';end if;
 for i in 3..5 loop
  s:=public.control_quiz_everyone(p2.player_id,p2.player_secret,'next',qid);qid:=(s->'question'->>'id')::uuid;
  update public.rooms set question_started_at=clock_timestamp()-interval '400 seconds' where id=rid;
  s:=public.get_quiz_game_player(p1.player_id,p1.player_secret);
 end loop;
 s:=public.control_quiz_everyone(p2.player_id,p2.player_secret,'next',qid);
 if s->>'status'<>'finished' or s->'results'->>'finish_reason'<>'completed' then raise exception 'FAIL finish';end if;
 before_result:=s->'results';
 s:=public.control_quiz_everyone(p2.player_id,p2.player_secret,'next',qid);
 if s->'results' is distinct from before_result then raise exception 'FAIL report changed';end if;
 if s::text like '%host_token%' or s::text like '%player_token%' then raise exception 'FAIL token leak';end if;
 select * into c from public.create_quiz_room_everyone('starter');
 for i in 1..20 loop select * into p from public.join_quiz_room(c.room_code,'Игрок '||i);end loop;
 begin perform public.join_quiz_room(c.room_code,'21');raise exception 'FAIL capacity';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;

 -- Modern questions, fractional scores, normalized text, and per-round/quiz rules.
 foreach mode in array array['question','round','quiz'] loop
 insert into public.quiz_templates(key,title,managed,public_metadata,questions) values('everyone-test-'||mode,'Тест',true,
  jsonb_build_object('title','Тест','score_timing',mode,'reveal_timing',mode),
  '[{"text":"Выберите","kind":"multiple","options":["Да","Нет","Тоже да"],"answer_key":[0,2],"points":1.5,"duration":30,"round":"Тур 1","round_number":1},{"text":"Ответ текстом","kind":"text","accepted":["Ёлка"],"points":2.5,"duration":30,"round":"Тур 2","round_number":2}]');
 select * into c from public.create_quiz_room_everyone('everyone-test-'||mode);
 select * into p1 from public.join_quiz_room(c.room_code,'Один');
 s:=public.control_quiz_everyone(p1.player_id,p1.player_secret,'start');qid:=(s->'question'->>'id')::uuid;
 if s->'question'->'correct_choices'<>'null'::jsonb then raise exception 'FAIL modern early answer';end if;
 perform public.submit_quiz_response(p1.player_id,p1.player_secret,qid,'{"choices":[0,2]}');
 s:=public.get_quiz_game_player(p1.player_id,p1.player_secret);
 if s->>'phase'<>'reveal' or s->'question'->>'round_end'<>'true' or s->>'next_round_title'<>'Тур 2' then raise exception 'FAIL modern round close';end if;
 s:=public.control_quiz_everyone(p1.player_id,p1.player_secret,'next',qid);qid:=(s->'question'->>'id')::uuid;
 perform public.submit_quiz_response(p1.player_id,p1.player_secret,qid,'{"text":"  елка  "}');
 s:=public.get_quiz_game_player(p1.player_id,p1.player_secret);
 s:=public.control_quiz_everyone(p1.player_id,p1.player_secret,'next',qid);
 if (s->'results'->'players'->0->>'score')::numeric<>4 then raise exception 'FAIL modern total';end if;
 end loop;
 insert into public.quiz_templates(key,title,managed,questions) values('everyone-manual','Ручная проверка',true,'[{"kind":"manual"}]');
 begin perform public.create_quiz_room_everyone('everyone-manual');raise exception 'FAIL manual accepted';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
end $$;
rollback;
select 'PASS: everyone room capacity, controller isolation, automatic closure/scoring, transfer, retries, modern rounds and manual exclusion' as result;
