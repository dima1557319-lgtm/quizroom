
import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  "https://uboszobopjauqrlsyodn.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "ВСТАВЬ_СВОЙ_PUBLISHABLE_KEY";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
