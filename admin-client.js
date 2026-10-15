import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
// Separate auth storage: an administrator session never becomes a player credential.
export const adminClient=createClient('https://uboszobopjauqrlsyodn.supabase.co','sb_publishable_teh-O-l3RIVkUCOluONL2w_60aT0AlB',{auth:{storageKey:'quizroom_admin_session',storage:sessionStorage,persistSession:true,detectSessionInURL:true}});
