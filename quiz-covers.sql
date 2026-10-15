begin;
create or replace function public.validate_quiz_document(doc jsonb) returns void language plpgsql set search_path='' as $$
declare r jsonb; q jsonb; o jsonb; k text; n integer:=0; v numeric; selected integer; opts integer;
begin
 if jsonb_typeof(doc) is distinct from 'object' or length(btrim(coalesce(doc->>'title',''))) not between 1 and 100 then raise exception 'Укажите название квиза (до 100 символов)'; end if;
 if doc->'cover' is not null and doc->'cover'<>'null'::jsonb then
  if jsonb_typeof(doc->'cover') is distinct from 'object' or coalesce(doc->'cover'->>'type','')<>'image' or coalesce(doc->'cover'->>'url','') !~ '^https://[^[:space:]]+$' or length(doc->'cover'->>'url')>2000 or length(coalesce(doc->'cover'->>'alt',''))>200 then raise exception 'Обложка: укажите HTTPS-ссылку на изображение и описание до 200 символов'; end if;
 end if;
 if length(coalesce(doc->>'description',''))>500 or length(coalesce(doc->>'category',''))>60 then raise exception 'Слишком длинное описание или тема'; end if;
 if coalesce(doc->>'price','') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then raise exception 'Цена: от 0 до 99999999,99 ₽'; end if;
 if coalesce(doc->>'score_timing','') not in ('question','round','quiz') or coalesce(doc->>'reveal_timing','') not in ('question','round','quiz') then raise exception 'Выберите порядок баллов и раскрытия ответов'; end if;
 if jsonb_typeof(doc->'rounds') is distinct from 'array' then raise exception 'Добавьте тур'; end if;
 if jsonb_array_length(doc->'rounds') not between 1 and 20 then raise exception 'От 1 до 20 туров'; end if;
 for r in select value from jsonb_array_elements(doc->'rounds') loop
  if length(btrim(coalesce(r->>'title',''))) not between 1 and 100 then raise exception 'Укажите название тура'; end if;
  if jsonb_typeof(r->'questions') is distinct from 'array' then raise exception 'Добавьте вопросы тура'; end if;
  if jsonb_array_length(r->'questions')=0 then raise exception 'Пустой тур нельзя публиковать'; end if;
  for q in select value from jsonb_array_elements(r->'questions') loop
   n:=n+1;k:=q->>'kind';
   if k is null or k not in ('single','multiple','text','manual') then raise exception 'Неизвестный тип ответа'; end if;
   if length(btrim(coalesce(q->>'text',''))) not between 1 and 500 then raise exception 'Вопрос: от 1 до 500 символов'; end if;
   if coalesce(q->>'points','') !~ '^[0-9]{1,5}(\.[0-9]{1,2})?$' or coalesce(q->>'duration','') !~ '^[0-9]{1,3}$' then raise exception 'Укажите баллы и время'; end if;
   if (q->>'points')::numeric not between 0 and 10000 or (q->>'duration')::integer not between 5 and 300 then raise exception 'Баллы: 0–10000; время: 5–300 секунд'; end if;
   if length(coalesce(q->>'explanation',''))>2000 then raise exception 'Пояснение: до 2000 символов'; end if;
   if k in ('single','multiple') then
    if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_typeof(q->'correct') is distinct from 'array' then raise exception 'Добавьте варианты и правильные ответы'; end if;
    opts:=jsonb_array_length(q->'options');
    if opts not between 2 and 8 then raise exception 'От 2 до 8 вариантов'; end if;
    for o in select value from jsonb_array_elements(q->'options') loop
     if jsonb_typeof(o) is distinct from 'string' or length(btrim(o#>>'{}')) not between 1 and 200 then raise exception 'Вариант ответа: от 1 до 200 символов'; end if;
    end loop;
    if (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(q->'options'))<>opts then raise exception 'Варианты не должны повторяться'; end if;
    if jsonb_array_length(q->'correct')=0 or (k='single' and jsonb_array_length(q->'correct')<>1) then raise exception 'Отметьте правильные варианты'; end if;
    if (select count(distinct value) from jsonb_array_elements(q->'correct'))<>jsonb_array_length(q->'correct') then raise exception 'Правильные варианты повторяются'; end if;
    for o in select value from jsonb_array_elements(q->'correct') loop
     if o::text !~ '^[0-7]$' then raise exception 'Неверный номер ответа'; end if;
     if o::text::integer>=opts then raise exception 'Номер ответа вне списка'; end if;
    end loop;
   elsif k='text' then
    if jsonb_typeof(q->'accepted') is distinct from 'array' then raise exception 'Добавьте допустимые написания ответа'; end if;
    if jsonb_array_length(q->'accepted') not between 1 and 30 then raise exception 'От 1 до 30 допустимых написаний'; end if;
    for o in select value from jsonb_array_elements(q->'accepted') loop
     if jsonb_typeof(o) is distinct from 'string' or length(btrim(o#>>'{}')) not between 1 and 500 then raise exception 'Пустой или слишком длинный допустимый ответ'; end if;
    end loop;
   end if;
   if q ? 'partial' and jsonb_typeof(q->'partial')<>'boolean' then raise exception 'Неверная настройка частичного ответа'; end if;
   if q ? 'case_sensitive' and jsonb_typeof(q->'case_sensitive')<>'boolean' then raise exception 'Неверная настройка регистра'; end if;
   foreach k in array array['media','answer_media'] loop
    if q->k is not null and q->k<>'null'::jsonb then
     if coalesce(q->k->>'type','') not in ('image','audio','video') or coalesce(q->k->>'url','') !~ '^https://[^[:space:]]+$' or length(q->k->>'url')>2000 then raise exception 'Медиа: укажите HTTPS-ссылку и тип'; end if;
    end if;
   end loop;
  end loop;
 end loop;
 if n not between 1 and 50 then raise exception 'В квизе должно быть от 1 до 50 вопросов'; end if;
end $$;
revoke all on function public.validate_quiz_document(jsonb) from public,anon,authenticated;

create or replace function public.list_quiz_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'title',title,'category',coalesce(public_metadata->>'category','Общие знания'),'description',coalesce(public_metadata->>'description',''),'icon',coalesce(public_metadata->>'icon','🧩'),'level',coalesce(public_metadata->>'level','Средний'),'question_count',jsonb_array_length(questions),'price',sale_price,'currency','RUB','managed',managed,'available',sale_price=0,'cover',public_metadata->'cover') order by key),'[]') from public.quiz_templates where enabled and key<>'starter'
$$;

grant execute on function public.list_quiz_catalog() to anon,authenticated;
commit;
