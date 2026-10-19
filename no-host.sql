-- Apply after game-reliability.sql. Existing hosted rooms keep their behavior.
begin;
alter table public.rooms add column if not exists play_mode text not null default 'hosted' check(play_mode in ('hosted','everyone'));
alter table public.rooms add column if not exists controller_player_id uuid;
alter table public.players add column if not exists last_seen_at timestamptz not null default clock_timestamp();

do $$begin
 if to_regprocedure('public.control_quiz_game_hosted(text,uuid,text,jsonb,uuid,text)') is null then
  alter function public.control_quiz_game_v2(text,uuid,text,jsonb,uuid,text) rename to control_quiz_game_hosted;
 end if;
 if to_regprocedure('public.join_quiz_room_hosted(text,text)') is null then
  alter function public.join_quiz_room(text,text) rename to join_quiz_room_hosted;
 end if;
end $$;
revoke all on function public.control_quiz_game_hosted(text,uuid,text,jsonb,uuid,text),public.join_quiz_room_hosted(text,text) from public,anon,authenticated;

create or replace function public.create_quiz_room_everyone(p_quiz_key text default 'starter')
returns table(room_code text) language plpgsql security definer set search_path='' as $$
declare made record; t public.quiz_templates%rowtype;
begin
 select * into t from public.quiz_templates where key=p_quiz_key and enabled for share;
 if not found then raise exception 'Выберите опубликованный квиз';end if;
 if exists(select 1 from jsonb_array_elements(t.questions) q where q->>'kind'='manual') then
  raise exception 'В этом квизе есть ручная проверка. Выберите другой квиз или режим с ведущим';
 end if;
 select * into made from public.create_quiz_room_v2(p_quiz_key);
 update public.rooms set play_mode='everyone' where code=made.room_code;
 -- Never give a participating creator the host credential or future questions.
 return query select made.room_code::text;
end $$;

create or replace function public.join_quiz_room(p_code text,p_name text)
returns table(player_id uuid,player_secret uuid,room_code text,player_name text) language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; joined record;
begin
 select * into r from public.rooms where code=p_code for update;
 if not found then raise exception 'Комната не найдена';end if;
 select * into joined from public.join_quiz_room_hosted(p_code,p_name);
 if r.play_mode='everyone' and r.controller_player_id is null then
  update public.rooms set controller_player_id=joined.player_id where id=r.id;
 end if;
 return query select joined.player_id::uuid,joined.player_secret::uuid,joined.room_code::text,joined.player_name::text;
end $$;

-- Called only after authenticating a player and while holding the room lock.
-- Any connected participant's poll closes an expired/fully answered question.
create or replace function public.tick_quiz_everyone(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; q public.questions%rowtype; successor uuid; ignored jsonb;
begin
 select * into strict r from public.rooms where id=p_room for update;
 if r.play_mode<>'everyone' then return;end if;
 if not exists(select 1 from public.players where id=r.controller_player_id and room_id=r.id and last_seen_at>clock_timestamp()-interval '30 seconds') then
  select id into successor from public.players where room_id=r.id and last_seen_at>clock_timestamp()-interval '30 seconds' order by joined_at,id limit 1;
  if successor is not null then update public.rooms set controller_player_id=successor where id=r.id;end if;
 end if;
 if r.status='playing' and r.game_phase='question' then
  select * into strict q from public.questions where room_id=r.id and question_number=r.current_question;
  if clock_timestamp()>=r.question_started_at+make_interval(secs=>q.duration)
    or not exists(select 1 from public.players p where p.room_id=r.id and not exists(select 1 from public.answers a where a.player_id=p.id and a.question_id=q.id)) then
   ignored:=public.control_quiz_game_hosted(r.code,r.host_token,'reveal',null,q.id,r.scoring_mode);
  end if;
 end if;
end $$;

create or replace function public.get_quiz_game_player(p_player_id uuid,p_player_secret uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid; r public.rooms%rowtype; result jsonb;
begin
 select room_id into rid from public.players where id=p_player_id and player_token=p_player_secret;
 if rid is null then raise exception 'Нет доступа игрока' using errcode='42501';end if;
 select * into strict r from public.rooms where id=rid for update;
 if r.play_mode='everyone' then
  update public.players set last_seen_at=clock_timestamp() where id=p_player_id;
  perform public.tick_quiz_everyone(rid);
  select * into strict r from public.rooms where id=rid;
 end if;
 result:=public.quiz_game_snapshot(rid,p_player_id);
 return result||jsonb_build_object('play_mode',r.play_mode,'can_control',r.play_mode='everyone' and r.controller_player_id=p_player_id,
  'controller_name',(select name from public.players where id=r.controller_player_id and room_id=rid));
end $$;

create or replace function public.control_quiz_everyone(p_player_id uuid,p_player_secret uuid,p_action text,p_question_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid; r public.rooms%rowtype; ignored jsonb;
begin
 select room_id into rid from public.players where id=p_player_id and player_token=p_player_secret;
 if rid is null then raise exception 'Нет доступа игрока' using errcode='42501';end if;
 select * into strict r from public.rooms where id=rid for update;
 -- Tick before renewing presence: an expired owner cannot reclaim a transferred turn.
 perform public.tick_quiz_everyone(rid);
 select * into strict r from public.rooms where id=rid;
 if r.play_mode<>'everyone' or r.controller_player_id is distinct from p_player_id then raise exception 'Управление доступно организатору' using errcode='42501';end if;
 if p_action is null or p_action not in ('start','next') then raise exception 'Недоступное действие';end if;
 if p_action='next' and p_question_id is distinct from (select id from public.questions where room_id=r.id and question_number=r.current_question) then
  return public.get_quiz_game_player(p_player_id,p_player_secret);
 end if;
 if p_action='start' and r.status='waiting' and exists(select 1 from jsonb_array_elements(r.admin_document->'questions') q where q->>'kind'='manual') then
  raise exception 'Для вопросов с ручной проверкой нужен ведущий';
 end if;
 if p_action='next' and r.status='playing' and r.game_phase<>'reveal' then raise exception 'Дождитесь всех ответов или окончания времени';end if;
 ignored:=public.control_quiz_game_hosted(r.code,r.host_token,p_action,null,p_question_id,r.scoring_mode);
 return public.get_quiz_game_player(p_player_id,p_player_secret);
end $$;

-- Preserve old APIs for hosted rooms; neither a stale client nor a leaked creator
-- credential may open the host projection/control path in an everyone room.
create or replace function public.control_quiz_game_v2(p_code text,p_host_secret uuid,p_action text,p_questions jsonb default null,p_question_id uuid default null,p_scoring_mode text default 'reveal')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.rooms where code=p_code and play_mode='everyone') then raise exception 'В этой комнате управление на экране игрока' using errcode='42501';end if;
 return public.control_quiz_game_hosted(p_code,p_host_secret,p_action,p_questions,p_question_id,p_scoring_mode);
end $$;
create or replace function public.get_quiz_game_host(p_code text,p_host_secret uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 select id into rid from public.rooms where code=p_code and host_token=p_host_secret and play_mode='hosted';
 if rid is null then raise exception 'Нет доступа ведущего' using errcode='42501';end if;
 return public.quiz_game_snapshot(rid,null);
end $$;

revoke all on function public.tick_quiz_everyone(uuid) from public,anon,authenticated;
revoke all on function public.create_quiz_room_everyone(text),public.join_quiz_room(text,text),public.get_quiz_game_player(uuid,uuid),public.control_quiz_everyone(uuid,uuid,text,uuid),public.control_quiz_game_v2(text,uuid,text,jsonb,uuid,text),public.get_quiz_game_host(text,uuid) from public;
grant execute on function public.create_quiz_room_everyone(text),public.join_quiz_room(text,text),public.get_quiz_game_player(uuid,uuid),public.control_quiz_everyone(uuid,uuid,text,uuid),public.control_quiz_game_v2(text,uuid,text,jsonb,uuid,text),public.get_quiz_game_host(text,uuid) to anon,authenticated;
commit;
