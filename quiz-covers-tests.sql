begin;
do $$
declare uid uuid:=gen_random_uuid();doc jsonb;saved jsonb;catalog jsonb;
begin
 select draft into doc from public.admin_quizzes where template_key='brainstorm';
 doc:=doc||'{"cover":{"type":"image","url":"https://example.invalid/quiz-cover.png","alt":"Обложка теста"}}'::jsonb;
 perform public.validate_quiz_document(doc);
 begin perform public.validate_quiz_document(jsonb_set(doc,'{cover,url}','"javascript:alert(1)"'));raise exception 'FAIL unsafe cover';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform public.validate_quiz_document(jsonb_set(doc,'{cover,type}','"video"'));raise exception 'FAIL non-image cover';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 insert into auth.users(id,email,email_confirmed_at) values(uid,'quiz-cover-test@example.invalid',now());insert into public.quiz_admins(user_id) values(uid);perform set_config('request.jwt.claim.sub',uid::text,true);
 saved:=public.admin_save_quiz(null,doc,0);
 if exists(select 1 from jsonb_array_elements(public.list_quiz_catalog()) v where v->>'key'=saved->>'template_key') then raise exception 'FAIL draft leaked';end if;
 perform public.admin_publish_quiz((saved->>'id')::uuid,1);
 select value into catalog from jsonb_array_elements(public.list_quiz_catalog()) where value->>'key'=saved->>'template_key';
 if catalog->'cover' is distinct from doc->'cover' or catalog ? 'rounds' or catalog ? 'questions' then raise exception 'FAIL public cover metadata';end if;
 saved:=public.admin_save_quiz((saved->>'id')::uuid,doc-'cover',1);perform public.admin_publish_quiz((saved->>'id')::uuid,2);
 select value into catalog from jsonb_array_elements(public.list_quiz_catalog()) where value->>'key'=saved->>'template_key';
 if catalog->'cover'<>'null'::jsonb then raise exception 'FAIL cover removal';end if;
end $$;
rollback;
select 'PASS: cover validation, private draft, publication, public metadata, removal' as result;
