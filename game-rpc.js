import {supabase} from './supabase-client.js';
export async function gameRpc(name,args){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
 const timeout=()=>({data:null,error:{code:'NETWORK_TIMEOUT',message:'Сервер не ответил вовремя. Проверьте соединение и обновите состояние игры перед повторной попыткой.'}});
 try{const result=await supabase.rpc(name,args).abortSignal(controller.signal);return controller.signal.aborted?timeout():result;}catch(e){if(controller.signal.aborted)return timeout();throw e;}finally{clearTimeout(timer);}
}
