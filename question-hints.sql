-- After classic-game.sql. Atomic, player-specific paid hints; safe to apply twice.
begin;
create table if not exists public.classic_hint_uses(
 player_id uuid not null references public.players(id) on delete cascade,
 question_id uuid not null references public.questions(id) on delete cascade,
 used_count integer not null check(used_count between 1 and 3),
 updated_at timestamptz not null default clock_timestamp(),primary key(player_id,question_id));
alter table public.classic_hint_uses enable row level security;
revoke all on public.classic_hint_uses from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.validate_quiz_before_hints(jsonb)') is null then alter function public.validate_quiz_document(jsonb) rename to validate_quiz_before_hints;end if;
end $$;
revoke all on function public.validate_quiz_before_hints(jsonb) from public,anon,authenticated;
create or replace function public.validate_quiz_document(doc jsonb) returns void language plpgsql set search_path='' as $$
declare r jsonb;q jsonb;h jsonb;s jsonb;
begin
 perform public.validate_quiz_before_hints(doc);
 for r in select value from jsonb_array_elements(doc->'rounds') loop
  s:=r->'rules';
  for q in select value from jsonb_array_elements(r->'questions') loop
   if q ? 'hints' and q->'hints'<>'null'::jsonb then
    if jsonb_typeof(q->'hints') is distinct from 'array' then raise exception 'Подсказки должны быть списком';end if;
    if jsonb_array_length(q->'hints')>3 then raise exception 'Не больше трёх подсказок';end if;
    for h in select value from jsonb_array_elements(q->'hints') loop
     if jsonb_typeof(h) is distinct from 'string' or length(btrim(h#>>'{}')) not between 1 and 500 then raise exception 'Подсказка: от 1 до 500 символов';end if;
    end loop;
    if jsonb_array_length(q->'hints')>0 and (doc->>'format' is distinct from 'classic' or (q->>'points')::numeric<>2 or coalesce((q->>'partial')::boolean,false) or s->'stakes'<>'[0]'::jsonb or exists(select 1 from jsonb_array_elements(coalesce(nullif(s->'stake_policy','null'::jsonb),'[]')) p where (p->>'correct_bonus')::numeric<>0 or (p->>'wrong')::numeric<>0)) then raise exception 'Вопрос с подсказками: 2 балла, точный зачёт и без ставок в туре';end if;
   end if;
  end loop;
 end loop;
end $$;
create or replace function public.classic_hint_state(def jsonb,player uuid,question uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('hint_count',jsonb_array_length(coalesce(nullif(def->'hints','null'::jsonb),'[]')),'hints_used',coalesce((select used_count from public.classic_hint_uses where player_id=player and question_id=question),0),'hints',(select coalesce(jsonb_agg(value order by ord),'[]') from jsonb_array_elements(coalesce(nullif(def->'hints','null'::jsonb),'[]')) with ordinality as h(value,ord) where ord<=coalesce((select used_count from public.classic_hint_uses where player_id=player and question_id=question),0)))
$$;
create or replace function public.classic_freeze(p_room uuid,p_question uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;q public.questions%rowtype;p public.players%rowtype;draft public.classic_drafts%rowtype;s jsonb;policy jsonb;right_answer boolean;base numeric;award numeric;hits integer;misses integer;
begin
 select * into strict r from public.rooms where id=p_room;s:=public.classic_rules(r.id);
 for q in select * from public.questions where room_id=r.id and (definition->>'round_number')::int=(r.classic_state->>'round')::int+1 and (p_question is null or id=p_question) loop
  for p in select * from public.players where room_id=r.id loop
   select * into draft from public.classic_drafts where player_id=p.id and question_id=q.id;
   base:=0;right_answer:=false;
   if draft.response is not null then
    if q.definition->>'kind'='text' then
     right_answer:=exists(select 1 from jsonb_array_elements_text(q.definition->'accepted') a where public.quiz_normalize_answer(a,coalesce((q.definition->>'case_sensitive')::boolean,false))=public.quiz_normalize_answer(draft.response->>'text',coalesce((q.definition->>'case_sensitive')::boolean,false)));
     if right_answer then base:=q.points;end if;
    else
     select count(*) filter(where q.definition->'answer_key' @> jsonb_build_array(value)),count(*) filter(where not(q.definition->'answer_key' @> jsonb_build_array(value))) into hits,misses from jsonb_array_elements(draft.response->'choices');
     right_answer:=misses=0 and hits=jsonb_array_length(q.definition->'answer_key');
     if coalesce((q.definition->>'partial')::boolean,false) then base:=q.points*greatest(0,hits-misses)/jsonb_array_length(q.definition->'answer_key');elsif right_answer then base:=q.points;end if;
    end if;
   end if;
   select value into policy from jsonb_array_elements(coalesce(nullif(s->'stake_policy','null'::jsonb),'[]')) where (value->>'stake')::int=coalesce(draft.stake,0);
   award:=case when draft.response is null then 0 when right_answer then greatest(0,base-0.5*coalesce((select used_count from public.classic_hint_uses where player_id=p.id and question_id=q.id),0))+coalesce((policy->>'correct_bonus')::numeric,draft.stake,0) when coalesce(draft.stake,0)>0 then coalesce((policy->>'wrong')::numeric,-draft.stake) else base+coalesce((policy->>'wrong')::numeric,0) end;
   insert into public.classic_awards(room_id,round_no,player_id,question_id,points,base_points,stake,correct,visible) values(r.id,(r.classic_state->>'round')::int+1,p.id,q.id,round(award,2),base,coalesce(draft.stake,0),right_answer,s->>'score_timing'='question') on conflict(player_id,question_id) do nothing;
   update public.classic_drafts set locked=true where player_id=p.id and question_id=q.id;
  end loop;
 end loop;
end $$;
create or replace function public.classic_snapshot(p_room uuid,p_player uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;s jsonb;ph text;rn integer;qs jsonb;drafts jsonb;rows jsonb;closed boolean;shown integer;
begin
 select * into strict r from public.rooms where id=p_room;s:=public.classic_rules(r.id);ph:=r.classic_state->>'phase';rn:=coalesce((r.classic_state->>'round')::int,0)+1;
 shown:=case when ph='intro' then 0 else r.current_question end;
 closed:=ph in ('review','round_results','break','finished');
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'number',q.question_number,'text',q.question_text,'rules',case when r.status='finished' then r.admin_document->'rounds'->((q.definition->>'round_number')::int-1)->'rules' else null end,'kind',q.definition->>'kind','options',q.definition->'options','points',q.points,'duration',q.duration,'animation',q.definition->>'animation','difficulty',q.definition->>'difficulty','media',q.definition->'media','media_start',q.definition->'media_start','media_end',q.definition->'media_end',
  'revealed',r.status='finished' or (closed and s->>'reveal_timing'<>'quiz') or (s->>'submission'='question' and s->>'reveal_timing'='question' and (q.question_number<r.current_question or ph='answer')),
  'answer',case when r.status='finished' or (closed and s->>'reveal_timing'<>'quiz') or (s->>'submission'='question' and s->>'reveal_timing'='question' and (q.question_number<r.current_question or ph='answer')) then jsonb_build_object('accepted',q.definition->'accepted','choices',q.definition->'answer_key','explanation',q.definition->>'explanation','media',q.definition->'answer_media') else null end)||public.classic_hint_state(q.definition,p_player,q.id) order by q.question_number),'[]') into qs
 from public.questions q where q.room_id=r.id and ((q.definition->>'round_number')::int=rn or r.status='finished') and q.question_number<=shown;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',d.question_id,'response',d.response,'stake',d.stake,'revision',d.revision,'locked',d.locked)),'[]') into drafts from public.classic_drafts d join public.questions q on q.id=d.question_id where d.player_id=p_player and q.room_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',a.question_id,'points',a.points,'stake',a.stake,'correct',a.correct)),'[]') into rows from public.classic_awards a where a.player_id=p_player and a.room_id=r.id and a.visible;
 return jsonb_build_object('format','classic','play_mode','everyone','room_code',r.code,'quiz_title',r.admin_document->>'title','quiz_cover',r.admin_document->'cover','status',r.status,'phase','classic','server_now',clock_timestamp(),'realtime_topic','quiz-lobby:'||r.lobby_topic::text,'can_control',r.controller_player_id=p_player,'controller_name',(select name from public.players where id=r.controller_player_id),
 'players',public.classic_standings(r.id),'question',null,'results',r.game_result,'total_questions',(select count(*) from public.questions where room_id=r.id),
 'classic',jsonb_build_object('phase',ph,'version',coalesce((r.classic_state->>'version')::int,0),'round_no',rn,'round_title',r.admin_document->'rounds'->(rn-1)->>'title','round_count',jsonb_array_length(r.admin_document->'rounds'),'cursor',r.current_question,'deadline',r.classic_state->'deadline','rules',case when coalesce((s->>'theme_hidden')::boolean,false) and not closed then s-'theme' else s end,'preflight',case when ph='intro' then (select coalesce(jsonb_agg(q.definition->'media'),'[]') from public.questions q where q.room_id=r.id and (q.definition->>'round_number')::int=rn and q.definition->'media' is not null and q.definition->'media'<>'null'::jsonb) else '[]'::jsonb end,'questions',qs,'drafts',drafts,'awards',rows,'submitted',exists(select 1 from public.classic_submissions where room_id=r.id and round_no=rn and player_id=p_player)));
end $$;

create or replace function public.classic_use_hint(p_player_id uuid,p_player_secret uuid,p_question_id uuid,p_hint_no integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;r public.rooms%rowtype;q public.questions%rowtype;s jsonb;ph text;used integer;
begin
 select room_id into rid from public.players where id=p_player_id and player_token=p_player_secret;
 if rid is null then raise exception 'Нет доступа игрока' using errcode='42501';end if;
 select * into strict r from public.rooms where id=rid for update;
 if r.admin_document->>'format' is distinct from 'classic' then raise exception 'Не многораундовая комната';end if;
 perform public.classic_tick(rid);select * into strict r from public.rooms where id=rid;
 s:=public.classic_rules(rid);ph:=r.classic_state->>'phase';
 select * into q from public.questions where id=p_question_id and room_id=rid and question_number<=r.current_question and (definition->>'round_number')::int=(r.classic_state->>'round')::int+1;
 if not found then raise exception 'Вопрос ещё не показан';end if;
 if p_hint_no is null or p_hint_no<1 or p_hint_no>jsonb_array_length(coalesce(nullif(q.definition->'hints','null'::jsonb),'[]')) then raise exception 'Недоступная подсказка';end if;
 select coalesce(max(used_count),0) into used from public.classic_hint_uses where player_id=p_player_id and question_id=q.id;
 if p_hint_no<=used then return public.classic_snapshot(rid,p_player_id);end if;
 if p_hint_no<>used+1 then raise exception 'Открывайте подсказки по порядку';end if;
 if r.status<>'playing' or ph not in ('question','question_done','repeat','submit') or exists(select 1 from public.classic_submissions where room_id=rid and player_id=p_player_id and round_no=(r.classic_state->>'round')::int+1) or exists(select 1 from public.classic_drafts where player_id=p_player_id and question_id=q.id and locked) or (s->>'submission'='question' and (ph<>'question' or q.question_number<>r.current_question)) then raise exception 'Подсказки закрыты';end if;
 insert into public.classic_hint_uses(player_id,question_id,used_count) values(p_player_id,q.id,p_hint_no) on conflict(player_id,question_id) do update set used_count=excluded.used_count,updated_at=clock_timestamp();
 update public.players set last_seen_at=clock_timestamp() where id=p_player_id;
 return public.classic_snapshot(rid,p_player_id);
end $$;
revoke all on function public.validate_quiz_document(jsonb),public.classic_hint_state(jsonb,uuid,uuid),public.classic_freeze(uuid,uuid),public.classic_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function public.classic_use_hint(uuid,uuid,uuid,integer) from public;
grant execute on function public.classic_use_hint(uuid,uuid,uuid,integer) to anon,authenticated;
commit;
