
import { createClient } from
  "./supabase-sdk.js?v=2.118.0";

const SUPABASE_URL =
  "https://uboszobopjauqrlsyodn.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_teh-O-l3RIVkUCOluONL2w_60aT0AlB";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
