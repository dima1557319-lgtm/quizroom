begin;
do $$
declare c record; p record; ready record; rp record; s jsonb; player_state jsonb; qid uuid; opts jsonb; mode text; i integer; expected numeric;
begin
 foreach mode in array array['reveal','finish'] loop
  select * into c from public.create_quiz_room_v2('custom');
  select * into p from public.join_quiz_room(c.room_code,'Тест дробных баллов');
  opts:='[{"text":"Половина","options":["Да","Нет","А","Б"],"correct":0,"duration":300,"points":0.5},{"text":"Один","options":["Да","Нет","А","Б"],"correct":0,"duration":300,"points":1},{"text":"Полтора","options":["Да","Нет","А","Б"],"correct":0,"duration":300,"points":1.5}]';
  begin
   perform public.control_quiz_game_v2(c.room_code,p.player_secret,'start',opts,null,mode);
   raise exception 'FAIL: player started host game';
  exception when insufficient_privilege then null; end;
  begin
   perform public.get_quiz_game_host(c.room_code,p.player_secret);
   raise exception 'FAIL: player accessed host';
  exception when insufficient_privilege then null; end;
  begin
   perform public.control_quiz_game_v2(c.room_code,c.host_secret,'start',jsonb_set(opts,'{0,points}','-0.5'),null,mode);
   raise exception 'FAIL: negative points accepted';
  exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
  s:=public.get_quiz_game_host(c.room_code,c.host_secret);
  if s->>'status'<>'waiting' then raise exception 'FAIL: invalid setup changed room'; end if;
  s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'start',opts,null,mode);
  expected:=0;
  for i in 0..2 loop
   qid:=(s->'question'->>'id')::uuid;
   player_state:=public.get_quiz_game_player(p.player_id,p.player_secret);
   if player_state ? 'setup_questions' or player_state ? 'can_edit_content' or player_state->'question'->>'correct_option' is not null then raise exception 'FAIL: leaked answers or editor'; end if;
   perform public.submit_quiz_answer(p.player_id,p.player_secret,qid,0);
   perform public.submit_quiz_answer(p.player_id,p.player_secret,qid,1);
   s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'reveal',null,qid,mode);
   expected:=expected+(opts->i->>'points')::numeric;
   if (s->'players'->0->>'score')::numeric<>case when mode='reveal' then expected else 0 end then raise exception 'FAIL: incorrect score timing'; end if;
   s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'reveal',null,qid,mode);
   s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'next',null,qid,mode);
  end loop;
  if s->>'status'<>'finished' or (s->'players'->0->>'score')::numeric<>3 then raise exception 'FAIL: expected exact 3 points'; end if;
 end loop;
 select * into ready from public.create_quiz_room_v2('starter');
 select * into rp from public.join_quiz_room(ready.room_code,'Тест защиты');
 s:=public.get_quiz_game_host(ready.room_code,ready.host_secret);
 if (s->>'can_edit_content')::boolean or s->'setup_questions'->0 ? 'correct' then raise exception 'FAIL: ready editor or answer exposed'; end if;
 begin
  perform public.control_quiz_game(ready.room_code,ready.host_secret,'start',opts,null);
  raise exception 'FAIL: old endpoint permits editing ready quiz';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 s:=public.control_quiz_game_v2(ready.room_code,ready.host_secret,'start','[{"points":0.5,"duration":30},{"points":1,"duration":30},{"points":1.5,"duration":30},{"points":0,"duration":30},{"points":2,"duration":30}]',null,'reveal');
 if s->'question'->>'text'<>'Какая планета самая большая в Солнечной системе?' then raise exception 'FAIL: template replaced'; end if;
 if has_table_privilege('anon','public.quiz_templates','SELECT') or has_function_privilege('anon','public.quiz_game_snapshot(uuid,uuid)','EXECUTE') then raise exception 'FAIL: private data accessible'; end if;
end $$;
rollback;
select 'PASS: fractional scoring, both modes, retries, role isolation, template protection' as result;
