begin;
-- Keep existing results; fractional points use exact decimal arithmetic.
alter table public.players alter column score type numeric(12,2) using score::numeric;
alter table public.answers alter column points_awarded type numeric(12,2) using points_awarded::numeric;
alter table public.questions add column if not exists points numeric(10,2) not null default 1000;
alter table public.questions alter column points set default 1;
alter table public.rooms add column if not exists scoring_mode text not null default 'reveal';
alter table public.rooms add column if not exists quiz_key text not null default 'starter';

create table if not exists public.quiz_templates (
 key text primary key, title text not null, questions jsonb not null
);
alter table public.quiz_templates enable row level security;
revoke all on public.quiz_templates from anon,authenticated;
insert into public.quiz_templates(key,title,questions) values ('starter','Быстрый старт',$quiz$[{"text":"Какая планета самая большая в Солнечной системе?","options":["Земля","Марс","Юпитер","Венера"],"correct":2,"duration":30,"points":1},{"text":"Сколько сторон у шестиугольника?","options":["4","5","6","8"],"correct":2,"duration":20,"points":1},{"text":"Кто написал «Евгения Онегина»?","options":["Пушкин","Толстой","Чехов","Гоголь"],"correct":0,"duration":30,"points":1},{"text":"Какой океан самый большой?","options":["Атлантический","Индийский","Северный Ледовитый","Тихий"],"correct":3,"duration":30,"points":1},{"text":"Сколько минут в двух часах?","options":["60","90","120","200"],"correct":2,"duration":20,"points":1}]$quiz$::jsonb) on conflict(key) do update set title=excluded.title,questions=excluded.questions;
insert into public.quiz_templates(key,title,questions) values ('brainstorm','Мозговой штурм',$quiz$[{"text":"Какая планета ближе всего к Солнцу?","options":["Венера","Меркурий","Марс","Земля"],"correct":1,"duration":30,"points":1},{"text":"Сколько континентов обычно выделяют в семиконтинентной модели?","options":["5","6","7","8"],"correct":2,"duration":30,"points":1},{"text":"Какой химический символ у золота?","options":["Ag","Fe","Au","O"],"correct":2,"duration":30,"points":1},{"text":"Как называется процесс, с помощью которого растения используют свет для образования органических веществ?","options":["Фотосинтез","Испарение","Кристаллизация","Брожение"],"correct":0,"duration":30,"points":1},{"text":"Сколько градусов в прямом угле?","options":["45","60","90","180"],"correct":2,"duration":30,"points":1},{"text":"Какой орган перекачивает кровь по организму человека?","options":["Печень","Сердце","Лёгкие","Желудок"],"correct":1,"duration":30,"points":1},{"text":"Какой газ составляет наибольшую долю земной атмосферы?","options":["Кислород","Углекислый газ","Водород","Азот"],"correct":3,"duration":30,"points":1},{"text":"Как называется естественный спутник Земли?","options":["Луна","Фобос","Титан","Европа"],"correct":0,"duration":30,"points":1},{"text":"Сколько байтов в одном кибибайте (КиБ)?","options":["100","1000","1024","2048"],"correct":2,"duration":30,"points":1},{"text":"Кто написал роман «Война и мир»?","options":["Фёдор Достоевский","Лев Толстой","Иван Тургенев","Антон Чехов"],"correct":1,"duration":30,"points":1},{"text":"Какой инструмент используют для измерения атмосферного давления?","options":["Термометр","Компас","Секундомер","Барометр"],"correct":3,"duration":30,"points":1},{"text":"Как записывается химическая формула воды?","options":["H₂O","CO₂","O₂","NaCl"],"correct":0,"duration":30,"points":1},{"text":"Какое из этих животных относится к млекопитающим?","options":["Акула","Крокодил","Дельфин","Осьминог"],"correct":2,"duration":30,"points":1},{"text":"Какое число является простым?","options":["21","29","33","39"],"correct":1,"duration":30,"points":1},{"text":"Как называется переход вещества из твёрдого состояния непосредственно в газообразное?","options":["Конденсация","Плавление","Замерзание","Сублимация"],"correct":3,"duration":30,"points":1}]$quiz$::jsonb) on conflict(key) do update set title=excluded.title,questions=excluded.questions;
insert into public.quiz_templates(key,title,questions) values ('cinema','Киномания',$quiz$[{"text":"Кто снял фильм «Титаник» (1997)?","options":["Стивен Спилберг","Джеймс Кэмерон","Кристофер Нолан","Питер Джексон"],"correct":1,"duration":30,"points":1},{"text":"В какой кинофраншизе встречается Хогвартс?","options":["Гарри Поттер","Властелин колец","Звёздные войны","Матрица"],"correct":0,"duration":30,"points":1},{"text":"Какой фильм получил «Оскар» за лучший фильм в 2020 году?","options":["1917","Джокер","Паразиты","Однажды в Голливуде"],"correct":2,"duration":30,"points":1},{"text":"Как зовут героя Киану Ривза в фильме «Матрица»?","options":["Нео","Морфеус","Смит","Сайфер"],"correct":0,"duration":30,"points":1},{"text":"Кто несёт Кольцо Всевластья к Роковой горе во «Властелине колец»?","options":["Арагорн","Леголас","Фродо","Гимли"],"correct":2,"duration":30,"points":1},{"text":"Как зовут львёнка — главного героя мультфильма «Король Лев»?","options":["Муфаса","Симба","Шрам","Тимон"],"correct":1,"duration":30,"points":1},{"text":"В какой серии фильмов появляется капитан Джек Воробей?","options":["Индиана Джонс","Хроники Нарнии","Парк юрского периода","Пираты Карибского моря"],"correct":3,"duration":30,"points":1},{"text":"К какому виду сказочных существ относится Шрек?","options":["Огр","Эльф","Гном","Тролль"],"correct":0,"duration":30,"points":1},{"text":"Как зовут игрушечного ковбоя из «Истории игрушек»?","options":["Базз","Рекс","Вуди","Слинки"],"correct":2,"duration":30,"points":1},{"text":"Какого цвета большинство миньонов в мультфильмах «Гадкий я»?","options":["Зелёного","Жёлтого","Синего","Красного"],"correct":1,"duration":30,"points":1},{"text":"Как называется мир, где живут на’ви в фильме «Аватар»?","options":["Татуин","Арракис","Криптон","Пандора"],"correct":3,"duration":30,"points":1},{"text":"В какой вид спорта играют на летающих мётлах в фильмах о Гарри Поттере?","options":["Квиддич","Кёрлинг","Поло","Регби"],"correct":0,"duration":30,"points":1},{"text":"Какое оружие чаще всего ассоциируется с джедаями из «Звёздных войн»?","options":["Арбалет","Трезубец","Световой меч","Бумеранг"],"correct":2,"duration":30,"points":1},{"text":"Как зовут Железного человека в киновселенной Marvel?","options":["Стив Роджерс","Тони Старк","Брюс Бэннер","Питер Паркер"],"correct":1,"duration":30,"points":1},{"text":"Какую роль сыграл Арнольд Шварценеггер в фильме «Терминатор» (1984)?","options":["Джон Коннор","Кайл Риз","Детектив Тракслер","Терминатор"],"correct":3,"duration":30,"points":1}]$quiz$::jsonb) on conflict(key) do update set title=excluded.title,questions=excluded.questions;
insert into public.quiz_templates(key,title,questions) values ('world','Вокруг света',$quiz$[{"text":"Столица Австралии — это...","options":["Сидней","Мельбурн","Канберра","Перт"],"correct":2,"duration":30,"points":1},{"text":"Какая страна занимает наибольшую площадь в мире?","options":["Канада","Китай","США","Россия"],"correct":3,"duration":30,"points":1},{"text":"Какой океан самый маленький по площади?","options":["Индийский","Северный Ледовитый","Атлантический","Тихий"],"correct":1,"duration":30,"points":1},{"text":"Какая гора считается самой высокой на Земле по высоте над уровнем моря?","options":["Эверест","Килиманджаро","Монблан","Эльбрус"],"correct":0,"duration":30,"points":1},{"text":"Какое море находится между югом Европы и севером Африки?","options":["Балтийское","Красное","Средиземное","Карибское"],"correct":2,"duration":30,"points":1},{"text":"Какой язык является официальным в Бразилии?","options":["Испанский","Португальский","Французский","Итальянский"],"correct":1,"duration":30,"points":1},{"text":"Какой город является столицей Японии?","options":["Киото","Осака","Нара","Токио"],"correct":3,"duration":30,"points":1},{"text":"Очертания какой страны часто сравнивают с сапогом?","options":["Италии","Норвегии","Чили","Греции"],"correct":0,"duration":30,"points":1},{"text":"У берегов какой страны находится Большой Барьерный риф?","options":["Мексики","Египта","Австралии","Индии"],"correct":2,"duration":30,"points":1},{"text":"В какой стране находится древний город Мачу-Пикчу?","options":["Боливия","Перу","Эквадор","Колумбия"],"correct":1,"duration":30,"points":1},{"text":"На каком материке расположены Анды?","options":["Африка","Евразия","Австралия","Южная Америка"],"correct":3,"duration":30,"points":1},{"text":"Какой город является столицей Канады?","options":["Оттава","Торонто","Монреаль","Ванкувер"],"correct":0,"duration":30,"points":1},{"text":"Какая река протекает через Париж?","options":["Темза","Дунай","Сена","Рейн"],"correct":2,"duration":30,"points":1},{"text":"Какой город является столицей Исландии?","options":["Хельсинки","Рейкьявик","Осло","Стокгольм"],"correct":1,"duration":30,"points":1},{"text":"На каком материке находится Южный полюс?","options":["Южная Америка","Австралия","Африка","Антарктида"],"correct":3,"duration":30,"points":1}]$quiz$::jsonb) on conflict(key) do update set title=excluded.title,questions=excluded.questions;

create or replace function public.create_quiz_room_v2(p_quiz_key text default 'starter')
returns table(room_code text,host_secret uuid) language plpgsql security definer set search_path='' as $$
declare created record;
begin
 if p_quiz_key is null or (p_quiz_key<>'custom' and not exists(select 1 from public.quiz_templates where key=p_quiz_key)) then
  raise exception 'Неизвестный квиз';
 end if;
 select * into created from public.create_quiz_room();
 update public.rooms set quiz_key=p_quiz_key where code=created.room_code and host_token=created.host_secret;
 return query select created.room_code::text,created.host_secret::uuid;
end $$;

create or replace function public.quiz_game_snapshot(p_room uuid,p_player uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; q public.questions%rowtype; a public.answers%rowtype; result jsonb; template public.quiz_templates%rowtype;
begin
 select * into strict r from public.rooms where id=p_room;
 select * into q from public.questions where room_id=r.id and question_number=r.current_question;
 if p_player is not null then select * into a from public.answers where question_id=q.id and player_id=p_player; end if;
 result:=jsonb_build_object('room_code',r.code,'status',r.status,'phase',r.game_phase,
  'scoring_mode',r.scoring_mode,'server_now',clock_timestamp(),'realtime_topic','quiz-lobby:'||r.lobby_topic::text,
  'total_questions',(select count(*) from public.questions where room_id=r.id),
  'players',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'player_name',p.name,'score',p.score) order by p.score desc,p.joined_at,p.id) from public.players p where room_id=r.id),'[]'::jsonb),
  'question',case when q.id is null then null else jsonb_build_object('id',q.id,'number',q.question_number,'text',q.question_text,'options',q.options,'points',q.points,
    'deadline',r.question_started_at+make_interval(secs=>q.duration),
    'correct_option',case when r.game_phase in ('reveal','finished') then q.correct_option else null end) end,
  'answer_count',(select count(*) from public.answers where question_id=q.id),'my_answer',a.selected_option);
 if p_player is null then
  select * into template from public.quiz_templates where key=r.quiz_key;
  result:=result||jsonb_build_object('quiz_key',r.quiz_key,'quiz_title',coalesce(template.title,'Свой квиз'),'can_edit_content',r.quiz_key='custom');
  if r.status='waiting' then
   result:=result||jsonb_build_object('setup_questions',coalesce((select jsonb_agg(jsonb_build_object('text',item->>'text','options',item->'options','duration',coalesce((item->>'duration')::integer,30),'points',coalesce((item->>'points')::numeric,1)) order by idx) from jsonb_array_elements(template.questions) with ordinality as source(item,idx)),'[]'::jsonb));
  end if;
 end if;
 return result;
end $$;
revoke all on function public.quiz_game_snapshot(uuid,uuid) from public,anon,authenticated;

create or replace function public.control_quiz_game_v2(p_code text,p_host_secret uuid,p_action text,p_questions jsonb default null,p_question_id uuid default null,p_scoring_mode text default 'reveal')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype; q public.questions%rowtype; item jsonb; opt jsonb; n integer:=0; template jsonb; fixed jsonb; value_points numeric; seconds integer;
begin
 select * into r from public.rooms where code=p_code and host_token=p_host_secret for update;
 if not found then raise exception 'Нет доступа ведущего' using errcode='42501'; end if;
 if p_action='start' then
  if r.status='playing' then return public.quiz_game_snapshot(r.id,null); end if;
  if r.status<>'waiting' then raise exception 'Игра уже завершена. Создайте новую комнату'; end if;
  if not exists(select 1 from public.players where room_id=r.id) then raise exception 'Дождитесь хотя бы одного игрока'; end if;
  if p_scoring_mode is null or p_scoring_mode not in ('reveal','finish') then raise exception 'Выберите порядок начисления'; end if;
  if p_questions is null or jsonb_typeof(p_questions)<>'array' then raise exception 'Нужен список вопросов'; end if;
  if jsonb_array_length(p_questions) not between 1 and 50 then raise exception 'Добавьте от 1 до 50 вопросов'; end if;
  if r.quiz_key<>'custom' then
   select questions into template from public.quiz_templates where key=r.quiz_key;
   if template is null or jsonb_array_length(template)<>jsonb_array_length(p_questions) then raise exception 'Состав готового квиза менять нельзя. Обновите страницу'; end if;
  end if;
  -- Validate every value before replacing a waiting room's draft.
  for item in select value from jsonb_array_elements(p_questions) loop
   if r.quiz_key='custom' then
    if jsonb_typeof(item->'text') is distinct from 'string' or length(btrim(item->>'text')) not between 1 and 500 then raise exception 'Текст вопроса: от 1 до 500 символов'; end if;
    if jsonb_typeof(item->'options') is distinct from 'array' then raise exception 'Нужны четыре варианта'; end if;
    if jsonb_array_length(item->'options')<>4 then raise exception 'Нужны четыре варианта'; end if;
    for opt in select value from jsonb_array_elements(item->'options') loop
     if jsonb_typeof(opt) is distinct from 'string' or length(btrim(opt#>>'{}')) not between 1 and 200 then raise exception 'Вариант: от 1 до 200 символов'; end if;
    end loop;
    if coalesce(item->>'correct','') !~ '^[0-3]$' then raise exception 'Выберите правильный ответ'; end if;
   else
    if item ? 'text' or item ? 'options' or item ? 'correct' then raise exception 'В готовом квизе запрещено менять вопросы и правильные ответы'; end if;
   end if;
   if coalesce(item->>'duration','') !~ '^[0-9]{1,3}$' then raise exception 'Время: от 5 до 300 секунд'; end if;
   if (item->>'duration')::integer not between 5 and 300 then raise exception 'Время: от 5 до 300 секунд'; end if;
   if coalesce(item->>'points','') !~ '^[0-9]{1,5}(\.[0-9]{1,2})?$' then raise exception 'Баллы: число с точностью до сотых'; end if;
   if (item->>'points')::numeric not between 0 and 10000 then raise exception 'Баллы: от 0 до 10000'; end if;
  end loop;
  delete from public.questions where room_id=r.id;
  for item in select value from jsonb_array_elements(p_questions) loop
   n:=n+1; fixed:=case when r.quiz_key='custom' then item else template->(n-1) end;
   insert into public.questions(room_id,question_number,question_text,options,correct_option,duration,points)
   values(r.id,n,btrim(fixed->>'text'),fixed->'options',(fixed->>'correct')::integer,(item->>'duration')::integer,(item->>'points')::numeric);
  end loop;
  update public.rooms set status='playing',game_phase='question',current_question=1,question_started_at=clock_timestamp(),scoring_mode=p_scoring_mode where id=r.id;
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
    update public.players p set score=coalesce((select sum(a.points_awarded) from public.answers a where a.player_id=p.id),0) where p.room_id=r.id;
    update public.rooms set status='finished',game_phase='finished' where id=r.id;
   end if;
  else
   if r.scoring_mode='reveal' or p_action='finish' then
    update public.players p set score=coalesce((select sum(a.points_awarded) from public.answers a where a.player_id=p.id),0) where p.room_id=r.id;
   end if;
   update public.rooms set game_phase=case when p_action='finish' then 'finished' else 'reveal' end,status=case when p_action='finish' then 'finished' else 'playing' end where id=r.id;
  end if;
 else raise exception 'Неизвестное действие'; end if;
 return public.quiz_game_snapshot(r.id,null);
end $$;

-- The old endpoint uses the same checks; stale clients cannot bypass template protection.
create or replace function public.control_quiz_game(p_code text,p_host_secret uuid,p_action text,p_questions jsonb default null,p_question_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return public.control_quiz_game_v2(p_code,p_host_secret,p_action,p_questions,p_question_id,'reveal');
end $$;

create or replace function public.submit_quiz_answer(p_player_id uuid,p_player_secret uuid,p_question_id uuid,p_option integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players%rowtype; r public.rooms%rowtype; q public.questions%rowtype; a public.answers%rowtype;
begin
 select * into p from public.players where id=p_player_id and player_token=p_player_secret;
 if not found then raise exception 'Нет доступа игрока' using errcode='42501'; end if;
 select * into strict r from public.rooms where id=p.room_id for update;
 select * into a from public.answers where question_id=p_question_id and player_id=p.id;
 if found then return jsonb_build_object('accepted',true,'selected_option',a.selected_option); end if;
 select * into q from public.questions where id=p_question_id and room_id=r.id and question_number=r.current_question;
 if not found or r.status<>'playing' or r.game_phase<>'question' then raise exception 'Этот вопрос уже закрыт'; end if;
 if clock_timestamp()>=r.question_started_at+make_interval(secs=>q.duration) then raise exception 'Время вышло'; end if;
 if p_option is null or p_option not between 0 and 3 then raise exception 'Неверный вариант ответа'; end if;
 insert into public.answers(question_id,player_id,selected_option,points_awarded)
 values(q.id,p.id,p_option,case when p_option=q.correct_option then q.points else 0 end);
 return jsonb_build_object('accepted',true,'selected_option',p_option);
end $$;
revoke all on function public.create_quiz_room_v2(text) from public;
revoke all on function public.control_quiz_game_v2(text,uuid,text,jsonb,uuid,text) from public;
grant execute on function public.create_quiz_room_v2(text),public.control_quiz_game_v2(text,uuid,text,jsonb,uuid,text) to anon,authenticated;
commit;
