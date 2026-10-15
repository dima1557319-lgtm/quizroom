begin;
alter table public.rooms add column if not exists game_phase text not null default 'lobby';
alter table public.rooms add column if not exists question_started_at timestamptz;

-- Internal projection. Never expose tokens or an unrevealed answer key.
create or replace function public.quiz_game_snapshot(p_room uuid,p_player uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; q public.questions%rowtype; a public.answers%rowtype;
begin
 select * into strict r from public.rooms where id=p_room;
 select * into q from public.questions where room_id=r.id and question_number=r.current_question;
 if p_player is not null then select * into a from public.answers where question_id=q.id and player_id=p_player; end if;
 return jsonb_build_object('room_code',r.code,'status',r.status,'phase',r.game_phase,
  'server_now',clock_timestamp(),'realtime_topic','quiz-lobby:'||r.lobby_topic::text,
  'total_questions',(select count(*) from public.questions where room_id=r.id),
  'players',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'player_name',p.name,'score',p.score) order by p.score desc,p.joined_at,p.id) from public.players p where room_id=r.id),'[]'::jsonb),
  'question',case when q.id is null then null else jsonb_build_object('id',q.id,'number',q.question_number,'text',q.question_text,'options',q.options,
    'deadline',r.question_started_at+make_interval(secs=>q.duration),
    'correct_option',case when r.game_phase in ('reveal','finished') then q.correct_option else null end) end,
  'answer_count',(select count(*) from public.answers where question_id=q.id),
  'my_answer',a.selected_option);
end $$;
revoke all on function public.quiz_game_snapshot(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_quiz_game_host(p_code text,p_host_secret uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 select id into rid from public.rooms where code=p_code and host_token=p_host_secret;
 if rid is null then raise exception 'Нет доступа ведущего' using errcode='42501'; end if;
 return public.quiz_game_snapshot(rid,null);
end $$;

create or replace function public.get_quiz_game_player(p_player_id uuid,p_player_secret uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 select room_id into rid from public.players where id=p_player_id and player_token=p_player_secret;
 if rid is null then raise exception 'Нет доступа игрока' using errcode='42501'; end if;
 return public.quiz_game_snapshot(rid,p_player_id);
end $$;

create or replace function public.control_quiz_game(p_code text,p_host_secret uuid,p_action text,p_questions jsonb default null,p_question_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; q public.questions%rowtype; item jsonb; opt jsonb; n integer:=0;
begin
 select * into r from public.rooms where code=p_code and host_token=p_host_secret for update;
 if not found then raise exception 'Нет доступа ведущего' using errcode='42501'; end if;
 if p_action='start' then
  if r.status='playing' then return public.quiz_game_snapshot(r.id,null); end if;
  if r.status<>'waiting' then raise exception 'Игра уже завершена. Создайте новую комнату'; end if;
  if not exists(select 1 from public.players where room_id=r.id) then raise exception 'Дождитесь хотя бы одного игрока'; end if;
  if p_questions is null or jsonb_typeof(p_questions)<>'array' then raise exception 'Нужен список вопросов'; end if;
  if jsonb_array_length(p_questions) not between 1 and 50 then raise exception 'Добавьте от 1 до 50 вопросов'; end if;
  -- Validate the entire set before replacing a waiting room's draft questions.
  for item in select value from jsonb_array_elements(p_questions) loop
   if jsonb_typeof(item->'text') is distinct from 'string' or length(btrim(item->>'text')) not between 1 and 500 then raise exception 'Текст вопроса: от 1 до 500 символов'; end if;
   if jsonb_typeof(item->'options') is distinct from 'array' then raise exception 'Нужны четыре варианта'; end if;
   if jsonb_array_length(item->'options')<>4 then raise exception 'Нужны четыре варианта'; end if;
   for opt in select value from jsonb_array_elements(item->'options') loop
    if jsonb_typeof(opt) is distinct from 'string' or length(btrim(opt#>>'{}')) not between 1 and 200 then raise exception 'Вариант: от 1 до 200 символов'; end if;
   end loop;
   if coalesce(item->>'correct','') !~ '^[0-3]$' then raise exception 'Выберите правильный ответ'; end if;
   if coalesce(item->>'duration','') !~ '^[0-9]{1,3}$' then raise exception 'Укажите время от 5 до 300 секунд'; end if;
   if (item->>'duration')::integer not between 5 and 300 then raise exception 'Время: от 5 до 300 секунд'; end if;
  end loop;
  delete from public.questions where room_id=r.id;
  for item in select value from jsonb_array_elements(p_questions) loop
   n:=n+1;
   insert into public.questions(room_id,question_number,question_text,options,correct_option,duration)
   values(r.id,n,btrim(item->>'text'),item->'options',(item->>'correct')::integer,(item->>'duration')::integer);
  end loop;
  update public.rooms set status='playing',game_phase='question',current_question=1,question_started_at=clock_timestamp() where id=r.id;
 elsif p_action in ('reveal','next','finish') then
  if r.status='finished' then return public.quiz_game_snapshot(r.id,null); end if;
  if r.status<>'playing' then raise exception 'Сначала начните игру'; end if;
  select * into q from public.questions where room_id=r.id and question_number=r.current_question;
  if p_question_id is distinct from q.id then return public.quiz_game_snapshot(r.id,null); end if;
  if p_action='next' then
   if r.game_phase<>'reveal' then raise exception 'Сначала покажите правильный ответ'; end if;
   if exists(select 1 from public.questions where room_id=r.id and question_number=r.current_question+1) then
    update public.rooms set current_question=current_question+1,game_phase='question',question_started_at=clock_timestamp() where id=r.id;
   else
    update public.rooms set status='finished',game_phase='finished' where id=r.id;
   end if;
  else
   -- Scores become visible only after the question has been closed.
   update public.players p set score=coalesce((select sum(a.points_awarded)::integer from public.answers a where a.player_id=p.id),0) where p.room_id=r.id;
   update public.rooms set game_phase=case when p_action='finish' then 'finished' else 'reveal' end,
    status=case when p_action='finish' then 'finished' else 'playing' end where id=r.id;
  end if;
 else raise exception 'Неизвестное действие'; end if;
 return public.quiz_game_snapshot(r.id,null);
end $$;

create or replace function public.submit_quiz_answer(p_player_id uuid,p_player_secret uuid,p_question_id uuid,p_option integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players%rowtype; r public.rooms%rowtype; q public.questions%rowtype; a public.answers%rowtype;
begin
 select * into p from public.players where id=p_player_id and player_token=p_player_secret;
 if not found then raise exception 'Нет доступа игрока' using errcode='42501'; end if;
 -- Same room lock as host control: an answer cannot race a reveal or next question.
 select * into strict r from public.rooms where id=p.room_id for update;
 select * into a from public.answers where question_id=p_question_id and player_id=p.id;
 if found then return jsonb_build_object('accepted',true,'selected_option',a.selected_option); end if;
 select * into q from public.questions where id=p_question_id and room_id=r.id and question_number=r.current_question;
 if not found or r.status<>'playing' or r.game_phase<>'question' then raise exception 'Этот вопрос уже закрыт'; end if;
 if clock_timestamp() >= r.question_started_at+make_interval(secs=>q.duration) then raise exception 'Время вышло'; end if;
 if p_option is null or p_option not between 0 and 3 then raise exception 'Неверный вариант ответа'; end if;
 insert into public.answers(question_id,player_id,selected_option,points_awarded)
 values(q.id,p.id,p_option,case when p_option=q.correct_option then 1000 else 0 end);
 return jsonb_build_object('accepted',true,'selected_option',p_option);
end $$;

-- Empty notifications only; every recipient re-fetches with their own secret.
create or replace function public.notify_quiz_game()
returns trigger language plpgsql security definer set search_path='' as $$
declare topic text;
begin
 if TG_TABLE_NAME='rooms' then topic:='quiz-lobby:'||new.lobby_topic::text;
 else select 'quiz-lobby:'||r.lobby_topic::text into topic from public.rooms r join public.players p on p.room_id=r.id where p.id=new.player_id; end if;
 begin perform realtime.send('{}'::jsonb,'lobby_changed',topic,false);
 exception when others then raise warning 'QuizRoom game notification failed'; end;
 return null;
end $$;
revoke all on function public.notify_quiz_game() from public,anon,authenticated;
drop trigger if exists quiz_game_room_changed on public.rooms;
create trigger quiz_game_room_changed after update of status,game_phase,current_question on public.rooms for each row execute function public.notify_quiz_game();
drop trigger if exists quiz_game_answer_changed on public.answers;
create trigger quiz_game_answer_changed after insert on public.answers for each row execute function public.notify_quiz_game();

revoke all on function public.get_quiz_game_host(text,uuid) from public;
revoke all on function public.get_quiz_game_player(uuid,uuid) from public;
revoke all on function public.control_quiz_game(text,uuid,text,jsonb,uuid) from public;
revoke all on function public.submit_quiz_answer(uuid,uuid,uuid,integer) from public;
grant execute on function public.get_quiz_game_host(text,uuid),public.get_quiz_game_player(uuid,uuid),public.control_quiz_game(text,uuid,text,jsonb,uuid),public.submit_quiz_answer(uuid,uuid,uuid,integer) to anon,authenticated;
commit;
