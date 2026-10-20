import {supabase} from './supabase-client.js?v=connect1';
import {requestWithTimeout} from './rpc-timeout.js?v=connect1';
export function gameRpc(name,args){return requestWithTimeout(supabase,name,args);}
