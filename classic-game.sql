-- After no-host.sql. Simple quizzes and active v1 rooms retain their engine.
begin;
alter table public.rooms add column if not exists classic_state jsonb;
create table if not exists public.classic_drafts(
 player_id uuid not null references public.players(id),question_id uuid not null references public.questions(id),
 response jsonb,stake integer not null default 0,revision integer not null default 1,locked boolean not null default false,
 primary key(player_id,question_id));
create table if not exists public.classic_submissions(
 room_id uuid not null references public.rooms(id),round_no integer not null,player_id uuid not null references public.players(id),
 submitted_at timestamptz not null default clock_timestamp(),primary key(room_id,round_no,player_id));
create table if not exists public.classic_awards(
 room_id uuid not null references public.rooms(id),round_no integer not null,player_id uuid not null references public.players(id),question_id uuid not null references public.questions(id),
 points numeric(12,2) not null,base_points numeric(12,2) not null,stake integer not null,correct boolean not null,visible boolean not null default false,
 primary key(player_id,question_id));
alter table public.classic_drafts enable row level security;
alter table public.classic_submissions enable row level security;
alter table public.classic_awards enable row level security;
revoke all on public.classic_drafts,public.classic_submissions,public.classic_awards from public,anon,authenticated;

do $$begin
 if to_regprocedure('public.validate_quiz_document_simple_v1(jsonb)') is null then alter function public.validate_quiz_document(jsonb) rename to validate_quiz_document_simple_v1;end if;
 if to_regprocedure('public.admin_publish_quiz_simple_v1(uuid,integer)') is null then alter function public.admin_publish_quiz(uuid,integer) rename to admin_publish_quiz_simple_v1;end if;
 if to_regprocedure('public.create_quiz_room_before_classic(text)') is null then alter function public.create_quiz_room_v2(text) rename to create_quiz_room_before_classic;end if;
 if to_regprocedure('public.create_quiz_everyone_before_classic(text)') is null then alter function public.create_quiz_room_everyone(text) rename to create_quiz_everyone_before_classic;end if;
 if to_regprocedure('public.get_quiz_player_before_classic(uuid,uuid)') is null then alter function public.get_quiz_game_player(uuid,uuid) rename to get_quiz_player_before_classic;end if;
 if to_regprocedure('public.control_quiz_everyone_before_classic(uuid,uuid,text,uuid)') is null then alter function public.control_quiz_everyone(uuid,uuid,text,uuid) rename to control_quiz_everyone_before_classic;end if;
 if to_regprocedure('public.list_quiz_catalog_before_classic()') is null then alter function public.list_quiz_catalog() rename to list_quiz_catalog_before_classic;end if;
end $$;
revoke all on function public.validate_quiz_document_simple_v1(jsonb),public.admin_publish_quiz_simple_v1(uuid,integer),public.create_quiz_room_before_classic(text),public.create_quiz_everyone_before_classic(text),public.get_quiz_player_before_classic(uuid,uuid),public.control_quiz_everyone_before_classic(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.list_quiz_catalog_before_classic() from public,anon,authenticated;
create or replace function public.list_quiz_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(value||jsonb_build_object('format',coalesce((select public_metadata->>'format' from public.quiz_templates where key=value->>'key'),'simple'))),'[]') from jsonb_array_elements(public.list_quiz_catalog_before_classic())
$$;
revoke all on function public.list_quiz_catalog() from public;
grant execute on function public.list_quiz_catalog() to anon,authenticated;

create or replace function public.validate_quiz_document(doc jsonb) returns void language plpgsql set search_path='' as $$
declare r jsonb;s jsonb;q jsonb;k text;ids text[]:='{}';ident text;v jsonb;
begin
 perform public.validate_quiz_document_simple_v1(doc);
 if not(doc ? 'format') or doc->>'format'='simple' then return;end if;
 if doc->>'format'<>'classic' or doc->>'schema_version'<>'2' or coalesce(doc->>'tie_break','') not in ('reverse_rounds','shared') then raise exception 'Неизвестный формат игры';end if;
 for r in select value from jsonb_array_elements(doc->'rounds') loop
  s:=r->'rules';
  if jsonb_typeof(s) is distinct from 'object' or coalesce(s->>'submission','') not in ('round','question') or coalesce(s->>'transition','') not in ('manual','auto') or coalesce(s->>'media_clock','') not in ('with_question','after_media') then raise exception 'Укажите правила и режим тура';end if;
  foreach k in array array['repeat_seconds','submit_seconds','break_seconds'] loop
   if coalesce(s->>k,'') !~ '^[0-9]{1,4}$' then raise exception 'Укажите целое время этапа';end if;
   if (s->>k)::int not between (case when k='break_seconds' then 0 else 5 end) and 1800 then raise exception 'Время этапа вне диапазона';end if;
  end loop;
  foreach k in array array['repeat','break_manual'] loop if jsonb_typeof(s->k) is distinct from 'boolean' then raise exception 'Укажите повтор и перерыв';end if;end loop;
  foreach k in array array['score_timing','reveal_timing'] loop
   if coalesce(s->>k,'') not in ('question','round','quiz') or (s->>'submission'='round' and s->>k='question') then raise exception 'Бланк тура раскрывает ответы и очки только после тура или игры';end if;
  end loop;
  if jsonb_typeof(s->'text') is distinct from 'string' or length(s->>'text')>2000 or coalesce(s->>'difficulty','') not in ('Лёгкий','Средний','Сложный','Смешанный') then raise exception 'Проверьте текст правил и сложность тура';end if;
  if (s ? 'theme' and jsonb_typeof(s->'theme') is distinct from 'string') or length(coalesce(s->>'theme',''))>100 or (s ? 'theme_hidden' and jsonb_typeof(s->'theme_hidden') is distinct from 'boolean') then raise exception 'Проверьте тему тура';end if;
  if jsonb_typeof(s->'stakes') is distinct from 'array' then raise exception 'Укажите разрешённые ставки';end if;
  if jsonb_array_length(s->'stakes') not between 1 and 3 or not(s->'stakes' @> '[0]'::jsonb) or (select count(distinct value) from jsonb_array_elements(s->'stakes'))<>jsonb_array_length(s->'stakes') then raise exception 'Ставки: 0, 1, 2 без повторов';end if;
  for v in select value from jsonb_array_elements(s->'stakes') loop if v::text not in ('0','1','2') then raise exception 'Недопустимая ставка';end if;end loop;
  if s ? 'stake_policy' and s->'stake_policy'<>'null'::jsonb then
   if jsonb_typeof(s->'stake_policy') is distinct from 'array' or jsonb_array_length(s->'stake_policy')<>jsonb_array_length(s->'stakes') then raise exception 'Проверьте таблицу ставок';end if;
   if (select count(distinct value->>'stake') from jsonb_array_elements(s->'stake_policy'))<>jsonb_array_length(s->'stakes') then raise exception 'Повтор ставки в таблице';end if;
   for v in select value from jsonb_array_elements(s->'stake_policy') loop
    if coalesce(v->>'stake','') !~ '^[0-2]$' or not(s->'stakes' @> jsonb_build_array(v->'stake')) then raise exception 'Лишняя ставка в таблице';end if;
    foreach k in array array['correct_bonus','wrong'] loop
     if jsonb_typeof(v->k) is distinct from 'number' or coalesce(v->>k,'') !~ '^-?[0-9]{1,5}(\.[0-9]{1,2})?$' then raise exception 'Начисление: число с двумя знаками';end if;
     if abs((v->>k)::numeric)>10000 then raise exception 'Начисление: от −10000 до 10000';end if;
    end loop;
   end loop;
  end if;
  for q in select value from jsonb_array_elements(r->'questions') loop
   if q ? 'difficulty' and q->>'difficulty' not in ('Лёгкий','Средний','Сложный') then raise exception 'Проверьте сложность вопроса';end if;
   if q->>'kind'='manual' or (jsonb_array_length(s->'stakes')>1 and coalesce((q->>'partial')::boolean,false)) then raise exception 'Используйте автоматическую проверку; частичный зачёт несовместим со ставками';end if;
   if q ? 'media_start' or q ? 'media_end' then
    if coalesce(q->'media'->>'type','') not in ('audio','video') or jsonb_typeof(q->'media_start') is distinct from 'number' or jsonb_typeof(q->'media_end') is distinct from 'number' then raise exception 'Укажите начало и конец медиафрагмента';end if;
    if (q->>'media_start')::numeric<0 or (q->>'media_end')::numeric<=(q->>'media_start')::numeric or (q->>'media_end')::numeric-(q->>'media_start')::numeric>1800 then raise exception 'Медиафрагмент вне диапазона';end if;
   end if;
   if s->>'media_clock'='after_media' and q->'media'->>'type' in ('audio','video') and not(q ? 'media_end') then raise exception 'Для таймера после медиа задайте фрагмент';end if;
  end loop;
  for ident in select r->>'id' union all select value->>'id' from jsonb_array_elements(r->'questions') loop
   if ident is null or ident !~ '^[A-Za-z0-9_-]{1,64}$' or ident=any(ids) then raise exception 'Нужны уникальные идентификаторы туров и вопросов';end if;ids:=array_append(ids,ident);
  end loop;
 end loop;
end $$;

create or replace function public.admin_publish_quiz(p_id uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.admin_quizzes%rowtype;outcome jsonb;
begin
 outcome:=public.admin_publish_quiz_simple_v1(p_id,p_revision);
 select * into strict saved from public.admin_quizzes where id=p_id;
 if saved.draft->>'format'='classic' then
  update public.quiz_templates set public_metadata=public_metadata||jsonb_build_object('rounds',saved.draft->'rounds','schema_version',2,'format','classic','tie_break',saved.draft->>'tie_break') where key=saved.template_key;
 end if;
 return outcome;
end $$;

create or replace function public.create_quiz_room_v2(p_quiz_key text default 'starter') returns table(room_code text,host_secret uuid) language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.quiz_templates where key=p_quiz_key and public_metadata->>'format'='classic') then raise exception 'Многораундовая игра запускается в режиме «Все играют — без ведущего»';end if;
 return query select * from public.create_quiz_room_before_classic(p_quiz_key);
end $$;
create or replace function public.create_quiz_room_everyone(p_quiz_key text default 'starter') returns table(room_code text) language plpgsql security definer set search_path='' as $$
declare made record;
begin
 if exists(select 1 from public.quiz_templates where key=p_quiz_key and public_metadata->>'format'='classic') then
  select * into made from public.create_quiz_room_before_classic(p_quiz_key);
  update public.rooms set play_mode='everyone' where code=made.room_code;
  return query select made.room_code::text;
 else return query select * from public.create_quiz_everyone_before_classic(p_quiz_key);end if;
end $$;

-- Helpers never expose templates or answer keys through PostgREST.
create or replace function public.classic_rules(p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select admin_document->'rounds'->coalesce((classic_state->>'round')::int,0)->'rules' from public.rooms where id=p_room
$$;
create or replace function public.classic_set_phase(p_room uuid,p_phase text,p_seconds integer default null) returns void language sql security definer set search_path='' as $$
 update public.rooms set classic_state=classic_state||jsonb_build_object('phase',p_phase,'deadline',case when p_seconds is null then null else clock_timestamp()+make_interval(secs=>p_seconds) end,'version',coalesce((classic_state->>'version')::int,0)+1),game_phase='classic' where id=p_room
$$;
create or replace function public.classic_open_question(p_room uuid,p_cursor integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;q public.questions%rowtype;s jsonb;
begin
 select * into strict r from public.rooms where id=p_room;
 select * into strict q from public.questions where room_id=r.id and question_number=p_cursor;
 update public.rooms set current_question=p_cursor,question_started_at=clock_timestamp(),classic_state=classic_state||jsonb_build_object('cursor',p_cursor) where id=r.id;
 s:=public.classic_rules(r.id);
 if s->>'media_clock'='after_media' and q.definition->'media'->>'type' in ('audio','video') then
  perform public.classic_set_phase(r.id,'media_wait',ceil((q.definition->>'media_end')::numeric-(q.definition->>'media_start')::numeric)::int);
 else perform public.classic_set_phase(r.id,'question',q.duration);end if;
end $$;
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
   award:=case when draft.response is null then 0 when right_answer then base+coalesce((policy->>'correct_bonus')::numeric,draft.stake,0) when coalesce(draft.stake,0)>0 then coalesce((policy->>'wrong')::numeric,-draft.stake) else base+coalesce((policy->>'wrong')::numeric,0) end;
   insert into public.classic_awards(room_id,round_no,player_id,question_id,points,base_points,stake,correct,visible) values(r.id,(r.classic_state->>'round')::int+1,p.id,q.id,round(award,2),base,coalesce(draft.stake,0),right_answer,s->>'score_timing'='question') on conflict(player_id,question_id) do nothing;
   update public.classic_drafts set locked=true where player_id=p.id and question_id=q.id;
  end loop;
 end loop;
end $$;
create or replace function public.classic_close_round(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.classic_freeze(p_room,null);
 if public.classic_rules(p_room)->>'score_timing'='round' then update public.classic_awards set visible=true where room_id=p_room and round_no=(select (classic_state->>'round')::int+1 from public.rooms where id=p_room);end if;
 perform public.classic_set_phase(p_room,'review',null);
end $$;
create or replace function public.classic_next_question(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;s jsonb;q public.questions%rowtype;
begin
 select * into strict r from public.rooms where id=p_room;s:=public.classic_rules(r.id);
 select * into q from public.questions where room_id=r.id and question_number=r.current_question+1 and (definition->>'round_number')::int=(r.classic_state->>'round')::int+1;
 if q.id is not null then perform public.classic_open_question(r.id,q.question_number);
 elsif (s->>'repeat')::boolean then perform public.classic_set_phase(r.id,'repeat',(s->>'repeat_seconds')::int);
 elsif s->>'submission'='round' then perform public.classic_set_phase(r.id,'submit',(s->>'submit_seconds')::int);
 else perform public.classic_close_round(r.id);end if;
end $$;
create or replace function public.classic_tick(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;s jsonb;ph text;expired boolean;all_done boolean;
begin
 select * into strict r from public.rooms where id=p_room for update;
 -- Existing election logic only: classic phases never use game_phase='question'.
 perform public.tick_quiz_everyone(r.id);
 if r.classic_state is null or r.status<>'playing' then return;end if;
 s:=public.classic_rules(r.id);ph:=r.classic_state->>'phase';expired:=clock_timestamp()>=(r.classic_state->>'deadline')::timestamptz;
 if ph='question' then
  all_done:=s->>'submission'='question' and not exists(select 1 from public.players p where p.room_id=r.id and not exists(select 1 from public.classic_drafts d join public.questions q on q.id=d.question_id where d.player_id=p.id and q.room_id=r.id and q.question_number=r.current_question and d.locked));
  if expired or all_done then
   if s->>'submission'='question' then perform public.classic_freeze(r.id,(select id from public.questions where room_id=r.id and question_number=r.current_question));end if;
   perform public.classic_set_phase(r.id,case when s->>'submission'='question' and s->>'reveal_timing'='question' then 'answer' else 'question_done' end,null);
   if s->>'transition'='auto' and not(s->>'submission'='question' and s->>'reveal_timing'='question') then perform public.classic_next_question(r.id);end if;
  end if;
 elsif ph='repeat' then
  if expired then
   if s->>'submission'='round' then perform public.classic_set_phase(r.id,'submit',(s->>'submit_seconds')::int);else perform public.classic_close_round(r.id);end if;
  end if;
 elsif ph='submit' then
  if expired or not exists(select 1 from public.players p where p.room_id=r.id and not exists(select 1 from public.classic_submissions x where x.room_id=r.id and x.round_no=(r.classic_state->>'round')::int+1 and x.player_id=p.id)) then perform public.classic_close_round(r.id);end if;
 elsif ph='break' and expired then
  update public.rooms set classic_state=classic_state||jsonb_build_object('round',(classic_state->>'round')::int+1) where id=r.id;
  perform public.classic_set_phase(r.id,'intro',null);
 end if;
end $$;

create or replace function public.classic_standings(p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with sums as(select p.id,p.name,p.joined_at,coalesce(sum(a.points) filter(where a.visible),0) as score,
  array(select coalesce(sum(x.points) filter(where x.visible),0) from generate_series(1,jsonb_array_length(r.admin_document->'rounds')) n left join public.classic_awards x on x.player_id=p.id and x.round_no=n group by n order by n desc) as reverse_scores
  from public.players p join public.rooms r on r.id=p.room_id left join public.classic_awards a on a.player_id=p.id where p.room_id=p_room group by p.id,p.name,p.joined_at,r.admin_document),
 ranked as(select *,dense_rank() over(order by score desc,case when (select admin_document->>'tie_break' from public.rooms where id=p_room)='reverse_rounds' then reverse_scores else '{}'::numeric[] end desc) as place from sums)
 select coalesce(jsonb_agg(jsonb_build_object('player_id',id,'player_name',name,'score',score,'rank',place,'round_scores',to_jsonb(reverse_scores)) order by place,joined_at,id),'[]') from ranked
$$;
create or replace function public.classic_snapshot(p_room uuid,p_player uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;s jsonb;ph text;rn integer;qs jsonb;drafts jsonb;rows jsonb;closed boolean;shown integer;
begin
 select * into strict r from public.rooms where id=p_room;s:=public.classic_rules(r.id);ph:=r.classic_state->>'phase';rn:=coalesce((r.classic_state->>'round')::int,0)+1;
 shown:=case when ph='intro' then 0 else r.current_question end;
 closed:=ph in ('review','round_results','break','finished');
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'number',q.question_number,'text',q.question_text,'rules',case when r.status='finished' then r.admin_document->'rounds'->((q.definition->>'round_number')::int-1)->'rules' else null end,'kind',q.definition->>'kind','options',q.definition->'options','points',q.points,'duration',q.duration,'animation',q.definition->>'animation','difficulty',q.definition->>'difficulty','media',q.definition->'media','media_start',q.definition->'media_start','media_end',q.definition->'media_end',
  'revealed',r.status='finished' or (closed and s->>'reveal_timing'<>'quiz') or (s->>'submission'='question' and s->>'reveal_timing'='question' and (q.question_number<r.current_question or ph='answer')),
  'answer',case when r.status='finished' or (closed and s->>'reveal_timing'<>'quiz') or (s->>'submission'='question' and s->>'reveal_timing'='question' and (q.question_number<r.current_question or ph='answer')) then jsonb_build_object('accepted',q.definition->'accepted','choices',q.definition->'answer_key','explanation',q.definition->>'explanation','media',q.definition->'answer_media') else null end) order by q.question_number),'[]') into qs
 from public.questions q where q.room_id=r.id and ((q.definition->>'round_number')::int=rn or r.status='finished') and q.question_number<=shown;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',d.question_id,'response',d.response,'stake',d.stake,'revision',d.revision,'locked',d.locked)),'[]') into drafts from public.classic_drafts d join public.questions q on q.id=d.question_id where d.player_id=p_player and q.room_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',a.question_id,'points',a.points,'stake',a.stake,'correct',a.correct)),'[]') into rows from public.classic_awards a where a.player_id=p_player and a.room_id=r.id and a.visible;
 return jsonb_build_object('format','classic','play_mode','everyone','room_code',r.code,'quiz_title',r.admin_document->>'title','quiz_cover',r.admin_document->'cover','status',r.status,'phase','classic','server_now',clock_timestamp(),'realtime_topic','quiz-lobby:'||r.lobby_topic::text,'can_control',r.controller_player_id=p_player,'controller_name',(select name from public.players where id=r.controller_player_id),
 'players',public.classic_standings(r.id),'question',null,'results',r.game_result,'total_questions',(select count(*) from public.questions where room_id=r.id),
 'classic',jsonb_build_object('phase',ph,'version',coalesce((r.classic_state->>'version')::int,0),'round_no',rn,'round_title',r.admin_document->'rounds'->(rn-1)->>'title','round_count',jsonb_array_length(r.admin_document->'rounds'),'cursor',r.current_question,'deadline',r.classic_state->'deadline','rules',case when coalesce((s->>'theme_hidden')::boolean,false) and not closed then s-'theme' else s end,'preflight',case when ph='intro' then (select coalesce(jsonb_agg(q.definition->'media'),'[]') from public.questions q where q.room_id=r.id and (q.definition->>'round_number')::int=rn and q.definition->'media' is not null and q.definition->'media'<>'null'::jsonb) else '[]'::jsonb end,'questions',qs,'drafts',drafts,'awards',rows,'submitted',exists(select 1 from public.classic_submissions where room_id=r.id and round_no=rn and player_id=p_player)));
end $$;

create or replace function public.get_quiz_game_player(p_player_id uuid,p_player_secret uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;r public.rooms%rowtype;
begin
 select room_id into rid from public.players where id=p_player_id and player_token=p_player_secret;
 if rid is null then raise exception 'Нет доступа игрока' using errcode='42501';end if;
 select * into strict r from public.rooms where id=rid for update;
 if r.admin_document->>'format' is distinct from 'classic' then return public.get_quiz_player_before_classic(p_player_id,p_player_secret);end if;
 update public.players set last_seen_at=clock_timestamp() where id=p_player_id;
 perform public.classic_tick(rid);return public.classic_snapshot(rid,p_player_id);
end $$;
create or replace function public.control_quiz_everyone(p_player_id uuid,p_player_secret uuid,p_action text,p_question_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.players p join public.rooms r on r.id=p.room_id where p.id=p_player_id and r.admin_document->>'format'='classic') then raise exception 'Используйте команды многораундовой игры';end if;
 return public.control_quiz_everyone_before_classic(p_player_id,p_player_secret,p_action,p_question_id);
end $$;

create or replace function public.classic_action(p_player_id uuid,p_player_secret uuid,p_action text,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;r public.rooms%rowtype;s jsonb;ph text;ignored jsonb;standings jsonb;
begin
 select room_id into rid from public.players where id=p_player_id and player_token=p_player_secret;
 if rid is null then raise exception 'Нет доступа игрока' using errcode='42501';end if;
 select * into strict r from public.rooms where id=rid for update;
 if r.admin_document->>'format' is distinct from 'classic' or r.play_mode<>'everyone' then raise exception 'Не многораундовая комната';end if;
 perform public.classic_tick(r.id);select * into strict r from public.rooms where id=rid;
 if r.controller_player_id is distinct from p_player_id then raise exception 'Управление доступно организатору' using errcode='42501';end if;
 if p_version is distinct from coalesce((r.classic_state->>'version')::int,0) then return public.classic_snapshot(r.id,p_player_id);end if;
 update public.players set last_seen_at=clock_timestamp() where id=p_player_id;
 if p_action='start' and r.status='waiting' then
  perform public.validate_quiz_document(r.admin_document);
  ignored:=public.control_quiz_game_hosted(r.code,r.host_token,'start',null,null,'reveal');
  update public.rooms set classic_state='{"round":0,"cursor":0,"version":0}' where id=r.id;
  perform public.classic_set_phase(r.id,'intro',null);
 elsif p_action='media_ready' and r.classic_state->>'phase'='media_wait' then
  if clock_timestamp()<(r.classic_state->>'deadline')::timestamptz then raise exception 'Дождитесь окончания медиафрагмента';end if;
  perform public.classic_set_phase(r.id,'question',(select duration from public.questions where room_id=r.id and question_number=r.current_question));
 elsif p_action='advance' then
  ph:=r.classic_state->>'phase';s:=public.classic_rules(r.id);
  if ph='intro' then perform public.classic_open_question(r.id,(select min(question_number) from public.questions where room_id=r.id and (definition->>'round_number')::int=(r.classic_state->>'round')::int+1));
  elsif ph in ('answer','question_done') then perform public.classic_next_question(r.id);
  elsif ph='review' then perform public.classic_set_phase(r.id,'round_results',null);
  elsif ph='round_results' then
   if (r.classic_state->>'round')::int+1=jsonb_array_length(r.admin_document->'rounds') then
    update public.classic_awards set visible=true where room_id=r.id;
    -- Signed classic totals are read from classic_awards. Keep the legacy
    -- players.score nonnegative constraint and simple scoring unchanged.
    standings:=public.classic_standings(r.id);
    update public.rooms set status='finished',finished_at=clock_timestamp(),finish_reason='completed',classic_state=classic_state||jsonb_build_object('phase','finished','version',(classic_state->>'version')::int+1),game_result=jsonb_build_object('version',2,'quiz_title',r.admin_document->>'title','room_code',r.code,'finished_at',clock_timestamp(),'finish_reason','completed','tie_break',r.admin_document->>'tie_break','players',standings,'question_count',(select count(*) from public.questions where room_id=r.id)) where id=r.id;
   elsif (s->>'break_manual')::boolean or (s->>'break_seconds')::int>0 then perform public.classic_set_phase(r.id,'break',case when (s->>'break_manual')::boolean then null else (s->>'break_seconds')::int end);
   else update public.rooms set classic_state=classic_state||jsonb_build_object('round',(classic_state->>'round')::int+1) where id=r.id;perform public.classic_set_phase(r.id,'intro',null);end if;
  elsif ph='break' then
   update public.rooms set classic_state=classic_state||jsonb_build_object('round',(classic_state->>'round')::int+1) where id=r.id;perform public.classic_set_phase(r.id,'intro',null);
  elsif ph='finished' then null;
  else raise exception 'Дождитесь окончания этапа';end if;
 else raise exception 'Недоступное действие';end if;
 return public.classic_snapshot(r.id,p_player_id);
end $$;

create or replace function public.classic_save_response(p_player_id uuid,p_player_secret uuid,p_question_id uuid,p_response jsonb,p_stake integer,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;r public.rooms%rowtype;q public.questions%rowtype;s jsonb;d public.classic_drafts%rowtype;v jsonb;k text;ph text;
begin
 select room_id into rid from public.players where id=p_player_id and player_token=p_player_secret;
 if rid is null then raise exception 'Нет доступа игрока' using errcode='42501';end if;
 select * into strict r from public.rooms where id=rid for update;
 if r.admin_document->>'format' is distinct from 'classic' then raise exception 'Не многораундовая комната';end if;
 perform public.classic_tick(r.id);select * into strict r from public.rooms where id=rid;
 s:=public.classic_rules(r.id);ph:=r.classic_state->>'phase';
 if r.status<>'playing' or ph not in ('question','question_done','repeat','submit') or exists(select 1 from public.classic_submissions where room_id=r.id and round_no=(r.classic_state->>'round')::int+1 and player_id=p_player_id) then raise exception 'Приём ответов закрыт';end if;
 select * into q from public.questions where id=p_question_id and room_id=r.id and (definition->>'round_number')::int=(r.classic_state->>'round')::int+1 and question_number<=r.current_question;
 if not found then raise exception 'Вопрос ещё не показан';end if;
 select * into d from public.classic_drafts where player_id=p_player_id and question_id=q.id;
 if d.locked or (s->>'submission'='question' and (ph<>'question' or q.question_number<>r.current_question)) then raise exception 'Ответ окончательно принят или время вышло';end if;
 if p_revision is distinct from coalesce(d.revision,0) then raise exception 'Ответ изменён в другой вкладке. Обновите состояние' using errcode='40001';end if;
 if p_stake is null or not(s->'stakes' @> jsonb_build_array(p_stake)) then raise exception 'Недопустимая ставка';end if;
 k:=q.definition->>'kind';
 if p_response is not null then
  if k='text' then
   if jsonb_typeof(p_response->'text') is distinct from 'string' or length(btrim(p_response->>'text')) not between 1 and 500 then raise exception 'Введите ответ до 500 символов';end if;
  elsif k in ('single','multiple') then
   if jsonb_typeof(p_response->'choices') is distinct from 'array' then raise exception 'Выберите вариант';end if;
   if jsonb_array_length(p_response->'choices') not between 1 and 8 or (k='single' and jsonb_array_length(p_response->'choices')<>1) or (select count(distinct value) from jsonb_array_elements(p_response->'choices'))<>jsonb_array_length(p_response->'choices') then raise exception 'Неверный набор вариантов';end if;
   for v in select value from jsonb_array_elements(p_response->'choices') loop
    if v::text !~ '^[0-7]$' or v::text::int>=jsonb_array_length(q.definition->'options') then raise exception 'Неверный вариант';end if;
   end loop;
  else raise exception 'Нужна автоматическая проверка';end if;
 end if;
 if p_response is null and p_stake<>0 then raise exception 'Ставка требует ответа';end if;
 insert into public.classic_drafts(player_id,question_id,response,stake,revision,locked) values(p_player_id,q.id,p_response,p_stake,coalesce(d.revision,0)+1,s->>'submission'='question')
 on conflict(player_id,question_id) do update set response=excluded.response,stake=excluded.stake,revision=excluded.revision,locked=excluded.locked;
 perform public.classic_tick(r.id);return public.classic_snapshot(r.id,p_player_id);
end $$;
create or replace function public.classic_submit_round(p_player_id uuid,p_player_secret uuid,p_round integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;r public.rooms%rowtype;
begin
 select room_id into rid from public.players where id=p_player_id and player_token=p_player_secret;
 if rid is null then raise exception 'Нет доступа игрока' using errcode='42501';end if;
 select * into strict r from public.rooms where id=rid for update;
 if r.admin_document->>'format' is distinct from 'classic' then raise exception 'Не многораундовая комната';end if;
 perform public.classic_tick(rid);select * into strict r from public.rooms where id=rid;
 if exists(select 1 from public.classic_submissions where room_id=rid and round_no=p_round and player_id=p_player_id) then return public.classic_snapshot(rid,p_player_id);end if;
 if r.status<>'playing' or p_round is distinct from (r.classic_state->>'round')::int+1 or r.classic_state->>'phase' not in ('repeat','submit') or public.classic_rules(rid)->>'submission'<>'round' then raise exception 'Сдать тур можно после показа всех вопросов';end if;
 insert into public.classic_submissions(room_id,round_no,player_id) values(rid,p_round,p_player_id) on conflict do nothing;
 update public.classic_drafts d set locked=true from public.questions q where q.id=d.question_id and q.room_id=rid and (q.definition->>'round_number')::int=p_round and d.player_id=p_player_id;
 if not exists(select 1 from public.players p where p.room_id=rid and not exists(select 1 from public.classic_submissions x where x.room_id=rid and x.round_no=p_round and x.player_id=p.id)) then perform public.classic_close_round(rid);end if;
 return public.classic_snapshot(rid,p_player_id);
end $$;

-- Explicit grants; all internal helpers stay inaccessible to browser roles.
revoke all on function public.validate_quiz_document(jsonb),public.classic_rules(uuid),public.classic_set_phase(uuid,text,integer),public.classic_open_question(uuid,integer),public.classic_freeze(uuid,uuid),public.classic_close_round(uuid),public.classic_next_question(uuid),public.classic_tick(uuid),public.classic_standings(uuid),public.classic_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_publish_quiz(uuid,integer),public.create_quiz_room_v2(text),public.create_quiz_room_everyone(text),public.get_quiz_game_player(uuid,uuid),public.control_quiz_everyone(uuid,uuid,text,uuid),public.classic_action(uuid,uuid,text,integer),public.classic_save_response(uuid,uuid,uuid,jsonb,integer,integer),public.classic_submit_round(uuid,uuid,integer) from public;
grant execute on function public.admin_publish_quiz(uuid,integer),public.create_quiz_room_v2(text),public.create_quiz_room_everyone(text),public.get_quiz_game_player(uuid,uuid),public.control_quiz_everyone(uuid,uuid,text,uuid),public.classic_action(uuid,uuid,text,integer),public.classic_save_response(uuid,uuid,uuid,jsonb,integer,integer),public.classic_submit_round(uuid,uuid,integer) to anon,authenticated;
commit;
