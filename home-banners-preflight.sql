begin;
create table if not exists public.home_banners(id uuid primary key default gen_random_uuid(),draft jsonb not null,published jsonb,revision integer not null default 1,published_revision integer,updated_at timestamptz not null default now());
alter table public.home_banners enable row level security;
revoke all on public.home_banners from public,anon,authenticated;
create or replace function public.admin_list_home_banners() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.is_quiz_admin() then raise exception 'Доступ только администратору' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(b) order by (draft->>'position')::integer,updated_at desc) from public.home_banners b),'[]');end $$;
create or replace function public.admin_save_home_banner(p_id uuid,p_document jsonb,p_revision integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.home_banners%rowtype;
begin
 if not public.is_quiz_admin() then raise exception 'Доступ только администратору' using errcode='42501';end if;
 if jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text)>20000 then raise exception 'Недопустимый баннер';end if;
 if coalesce(p_document->>'position','') !~ '^[0-9]{1,3}$' then raise exception 'Порядок: целое число от 0 до 999';end if;
 if p_id is null then
  if (select count(*) from public.home_banners)>=100 then raise exception 'Не более 100 баннеров';end if;
  insert into public.home_banners(draft) values(p_document) returning * into saved;
 else
  update public.home_banners set draft=p_document,revision=revision+1,updated_at=now() where id=p_id and revision=p_revision returning * into saved;
  if not found then raise exception 'Баннер изменён в другой вкладке. Обновите список' using errcode='40001';end if;
 end if;
 return to_jsonb(saved);
end $$;
create or replace function public.admin_publish_home_banner(p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare b public.home_banners%rowtype;d jsonb;k text;
begin
 if not public.is_quiz_admin() then raise exception 'Доступ только администратору' using errcode='42501';end if;
 perform pg_advisory_xact_lock(78104215);
 select * into b from public.home_banners where id=p_id and revision=p_revision for update;
 if not found then raise exception 'Сначала сохраните актуальную версию баннера';end if;d:=b.draft;
 if length(btrim(coalesce(d->>'title',''))) not between 1 and 120 or length(coalesce(d->>'text',''))>600 then raise exception 'Заголовок: 1–120 символов, текст: до 600';end if;
 if coalesce(d->>'kind','') not in ('announcement','information','advertisement') then raise exception 'Выберите тип баннера';end if;
 foreach k in array array['image_url','link_url'] loop
  if coalesce(d->>k,'')<>'' and (d->>k !~ '^https://[^[:space:]]+$' or length(d->>k)>2000) then raise exception 'Используйте HTTPS-ссылку до 2000 символов';end if;
 end loop;
 if length(coalesce(d->>'image_alt',''))>200 or length(coalesce(d->>'link_label',''))>40 then raise exception 'Описание картинки: до 200, текст кнопки: до 40 символов';end if;
 if coalesce(d->>'link_url','')<>'' and length(btrim(coalesce(d->>'link_label','')))=0 then raise exception 'Добавьте текст кнопки';end if;
 if b.published is null and (select count(*) from public.home_banners where published is not null)>=12 then raise exception 'На главной можно одновременно показать до 12 баннеров';end if;
 update public.home_banners set published=d,published_revision=revision,updated_at=now() where id=p_id;
end $$;
create or replace function public.admin_hide_home_banner(p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_quiz_admin() then raise exception 'Доступ только администратору' using errcode='42501';end if;
 update public.home_banners set published=null,published_revision=null,updated_at=now() where id=p_id and revision=p_revision;
 if not found then raise exception 'Баннер изменён. Обновите список' using errcode='40001';end if;
end $$;
create or replace function public.list_home_banners() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(published||jsonb_build_object('id',id) order by (published->>'position')::integer,updated_at desc,id),'[]') from public.home_banners where published is not null
$$;
revoke all on function public.admin_list_home_banners(),public.admin_save_home_banner(uuid,jsonb,integer),public.admin_publish_home_banner(uuid,integer),public.admin_hide_home_banner(uuid,integer),public.list_home_banners() from public,anon,authenticated;
grant execute on function public.admin_list_home_banners(),public.admin_save_home_banner(uuid,jsonb,integer),public.admin_publish_home_banner(uuid,integer),public.admin_hide_home_banner(uuid,integer) to authenticated;
grant execute on function public.list_home_banners() to anon,authenticated;

do $$
declare uid uuid:=gen_random_uuid();a jsonb;b jsonb;d jsonb;pub jsonb;i int;before_count int;
begin
 if has_table_privilege('anon','public.home_banners','SELECT') or has_function_privilege('anon','public.admin_save_home_banner(uuid,jsonb,integer)','EXECUTE') then raise exception 'FAIL public write/private table';end if;
 begin perform public.admin_list_home_banners();raise exception 'FAIL anonymous admin';exception when insufficient_privilege then null;end;
 insert into auth.users(id,email,email_confirmed_at) values(uid,'home-banner-rollback@example.invalid',now());insert into public.quiz_admins(user_id) values(uid);perform set_config('request.jwt.claim.sub',uid::text,true);
 d:='{"title":"Private banner draft","text":"Initial text","kind":"announcement","position":100,"image_url":"","image_alt":"","link_url":"https://example.invalid/quiz","link_label":"Подробнее"}';
 a:=public.admin_save_home_banner(null,d,0);
 if exists(select 1 from jsonb_array_elements(public.list_home_banners()) v where v->>'id'=a->>'id') then raise exception 'FAIL draft leaked';end if;
 begin perform public.admin_save_home_banner((a->>'id')::uuid,d,0);raise exception 'FAIL stale revision';exception when serialization_failure then null;end;
 perform public.admin_publish_home_banner((a->>'id')::uuid,1);
 a:=public.admin_save_home_banner((a->>'id')::uuid,jsonb_set(d,'{text}','"Changed private text"'),1);
 select value into pub from jsonb_array_elements(public.list_home_banners()) where value->>'id'=a->>'id';
 if pub->>'text'<>'Initial text' or pub ? 'draft' or pub ? 'revision' then raise exception 'FAIL published isolation';end if;
 perform public.admin_publish_home_banner((a->>'id')::uuid,2);
 select value into pub from jsonb_array_elements(public.list_home_banners()) where value->>'id'=a->>'id';if pub->>'text'<>'Changed private text' then raise exception 'FAIL republish';end if;
 b:=public.admin_save_home_banner(null,jsonb_set(d,'{position}','0'),0);perform public.admin_publish_home_banner((b->>'id')::uuid,1);
 if (select ord from jsonb_array_elements(public.list_home_banners()) with ordinality x(v,ord) where v->>'id'=b->>'id')>=(select ord from jsonb_array_elements(public.list_home_banners()) with ordinality x(v,ord) where v->>'id'=a->>'id') then raise exception 'FAIL banner order';end if;
 b:=public.admin_save_home_banner((b->>'id')::uuid,jsonb_set(d,'{link_url}','"javascript:alert(1)"'),1);
 begin perform public.admin_publish_home_banner((b->>'id')::uuid,2);raise exception 'FAIL unsafe link';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 perform public.admin_hide_home_banner((a->>'id')::uuid,2);
 if exists(select 1 from jsonb_array_elements(public.list_home_banners()) v where v->>'id'=a->>'id') or not exists(select 1 from public.home_banners where id=(a->>'id')::uuid) then raise exception 'FAIL hide preserves draft';end if;
 select count(*) into before_count from public.home_banners where published is not null;
 for i in 1..(12-before_count) loop a:=public.admin_save_home_banner(null,d,0);perform public.admin_publish_home_banner((a->>'id')::uuid,1);end loop;
 a:=public.admin_save_home_banner(null,d,0);
 begin perform public.admin_publish_home_banner((a->>'id')::uuid,1);raise exception 'FAIL published limit';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
end $$;
rollback;
select 'PASS: private drafts, admin access, revisions, publishing, order, safe links, hiding, banner limit' as result;
