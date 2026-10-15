begin;
-- Additive migration: existing room/player RPCs, tokens and RLS stay intact.
alter table public.rooms add column if not exists lobby_topic uuid not null default gen_random_uuid();

create or replace function public.get_quiz_host_lobby(p_code text, p_host_secret uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype; result jsonb;
begin
  select * into r from public.rooms where code=p_code and host_token=p_host_secret;
  if not found then
    raise exception 'Host access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('player_id',p.id,'player_name',p.name)
    order by p.joined_at,p.id),'[]'::jsonb) into result
    from public.players p where p.room_id=r.id;
  return jsonb_build_object('room_code',r.code,'players',result,
    'realtime_topic','quiz-lobby:'||r.lobby_topic::text);
end $$;
revoke all on function public.get_quiz_host_lobby(text,uuid) from public;
grant execute on function public.get_quiz_host_lobby(text,uuid) to anon,authenticated;

create or replace function public.notify_quiz_lobby()
returns trigger language plpgsql security definer set search_path = '' as $$
declare topic text; rid uuid;
begin
  if TG_OP='DELETE' then rid:=old.room_id; else rid:=new.room_id; end if;
  select 'quiz-lobby:'||lobby_topic::text into topic from public.rooms where id=rid;
  if topic is not null then
    -- No row data: the receiver must re-fetch using the host secret.
    -- Notification failure must not prevent players from joining.
    begin
      perform realtime.send('{}'::jsonb,'lobby_changed',topic,false);
    exception when others then
      raise warning 'QuizRoom lobby notification failed';
    end;
  end if;
  return null;
end $$;
revoke all on function public.notify_quiz_lobby() from public,anon,authenticated;
drop trigger if exists quiz_lobby_changed on public.players;
create trigger quiz_lobby_changed after insert or delete or update of name on public.players
for each row execute function public.notify_quiz_lobby();
commit;
