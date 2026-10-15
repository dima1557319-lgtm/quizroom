begin;
do $$
declare t record; room record; player record; s jsonb; config jsonb; count_tested integer:=0;
begin
 for t in select * from public.quiz_templates where key in ('brainstorm','cinema','world','history','music','sport','technology','literature','nature','space','food','art','myths','animals','ocean','math','physics','chemistry','biology','russian','english','games','animation','fairytales','cities','inventions','earth','logic','architecture','culture') order by key loop
  if jsonb_array_length(t.questions)<>15 then raise exception 'Wrong question count: %',t.key; end if;
  select * into room from public.create_quiz_room_v2(t.key);
  select * into player from public.join_quiz_room(room.room_code,'Проверка каталога');
  s:=public.get_quiz_game_host(room.room_code,room.host_secret);
  if s->>'quiz_key'<>t.key or jsonb_array_length(s->'setup_questions')<>15 or (s->>'can_edit_content')::boolean then raise exception 'Bad room: %',t.key; end if;
  if s->'setup_questions'->0 ? 'correct' then raise exception 'Answer leaked: %',t.key; end if;
  select jsonb_agg(jsonb_build_object('points',case when ord=1 then 0.5 when ord=2 then 1.5 else 1 end,'duration',30) order by ord) into config from jsonb_array_elements(t.questions) with ordinality as src(item,ord);
  s:=public.control_quiz_game_v2(room.room_code,room.host_secret,'start',config,null,'reveal');
  if (s->>'total_questions')::integer<>15 or s->'question'->>'text'<>t.questions->0->>'text' or (s->'question'->>'points')::numeric<>0.5 then raise exception 'Start failed: %',t.key; end if;
  s:=public.get_quiz_game_player(player.player_id,player.player_secret);
  if s ? 'setup_questions' or s->'question'->>'correct_option' is not null then raise exception 'Player leak: %',t.key; end if;
  count_tested:=count_tested+1;
 end loop;
 if count_tested<>30 then raise exception 'Expected 30 quizzes, got %',count_tested; end if;
end $$;
rollback;
select 'PASS: 30 catalog quizzes, 450 questions, protected multiplayer start, configurable points' as result;
