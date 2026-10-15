begin;
create or replace function public.admin_delete_quiz(p_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare item public.admin_quizzes%rowtype;
begin
 if not public.is_quiz_admin() then raise exception 'Доступ только администратору' using errcode='42501'; end if;
 select * into item from public.admin_quizzes where id=p_id for update;
 if not found then raise exception 'Квиз уже удалён. Обновите список'; end if;
 if item.revision is distinct from p_revision then raise exception 'Квиз изменён в другой вкладке. Обновите список и проверьте его перед удалением' using errcode='40001'; end if;
 -- Existing rooms retain their copied questions and answers. Shared media are retained.
 delete from public.quiz_templates where key=item.template_key;
 delete from public.admin_quizzes where id=item.id;
end $$;
revoke all on function public.admin_delete_quiz(uuid,integer) from public,anon,authenticated;
grant execute on function public.admin_delete_quiz(uuid,integer) to authenticated;

do $$
declare uid uuid:=gen_random_uuid();doc jsonb;saved jsonb;draft jsonb;c record;p record;s jsonb;qid uuid;
begin
 if has_function_privilege('anon','public.admin_delete_quiz(uuid,integer)','EXECUTE') then raise exception 'FAIL anon delete permission';end if;
 begin perform public.admin_delete_quiz(gen_random_uuid(),1);raise exception 'FAIL unauthorized delete';exception when insufficient_privilege then null;end;
 select q.draft into doc from public.admin_quizzes q where template_key='brainstorm';
 insert into auth.users(id,email,email_confirmed_at) values(uid,'quiz-delete-rollback@example.invalid',now());insert into public.quiz_admins(user_id) values(uid);perform set_config('request.jwt.claim.sub',uid::text,true);
 saved:=public.admin_save_quiz(null,doc,0);perform public.admin_publish_quiz((saved->>'id')::uuid,1);
 select * into c from public.create_quiz_room_v2(saved->>'template_key');select * into p from public.join_quiz_room(c.room_code,'Delete rollback test');s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'start',null,null,'reveal');qid:=(s->'question'->>'id')::uuid;
 begin perform public.admin_delete_quiz((saved->>'id')::uuid,0);raise exception 'FAIL stale revision delete';exception when serialization_failure then null;end;
 perform public.admin_delete_quiz((saved->>'id')::uuid,1);
 if exists(select 1 from public.admin_quizzes where id=(saved->>'id')::uuid) or exists(select 1 from public.quiz_templates where key=saved->>'template_key') then raise exception 'FAIL quiz remains';end if;
 if exists(select 1 from jsonb_array_elements(public.list_quiz_catalog()) v where v->>'key'=saved->>'template_key') then raise exception 'FAIL deleted quiz in catalog';end if;
 if exists(select 1 from jsonb_array_elements(public.admin_list_quizzes()) v where v->>'id'=saved->>'id') then raise exception 'FAIL deleted quiz in admin list';end if;
 perform public.submit_quiz_response(p.player_id,p.player_secret,qid,'{"choices":[1]}');s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'reveal',null,qid,'reveal');s:=public.control_quiz_game_v2(c.room_code,c.host_secret,'next',null,qid,'reveal');if s->>'status'<>'playing' then raise exception 'FAIL active room lost';end if;
 draft:=public.admin_save_quiz(null,doc,0);perform public.admin_delete_quiz((draft->>'id')::uuid,1);
end $$;
rollback;
select 'PASS: admin-only deletion, stale revision protection, published and draft deletion, catalog removal, active game preserved' as result;
