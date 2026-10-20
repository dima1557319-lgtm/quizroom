// A hard deadline also covers SDK/auth waits before fetch starts.
export async function requestWithTimeout(client,name,args,timeoutMs=12000){
 const controller=new AbortController();let timer;
 const timeoutResult={data:null,error:{code:'NETWORK_TIMEOUT',message:'Сервер не ответил за 12 секунд. Проверьте соединение и повторите попытку.'}};
 const deadline=new Promise(resolve=>{timer=setTimeout(()=>{resolve(timeoutResult);controller.abort();},timeoutMs);});
 try{return await Promise.race([Promise.resolve().then(()=>client.rpc(name,args).abortSignal(controller.signal)),deadline]);}
 catch(error){if(controller.signal.aborted)return timeoutResult;throw error;}
 finally{clearTimeout(timer);}
}
