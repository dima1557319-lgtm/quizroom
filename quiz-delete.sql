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
commit;
