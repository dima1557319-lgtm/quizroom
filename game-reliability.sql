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
commit;
