/** Maximum simultaneous QA context requests. The Supabase RPC remains the
 * authoritative, shared 15-requests/minute limit across users and tabs.
 * The HTTP 429 Retry-After handler is still used by every individual request.
 */
export const SEMANTIC_CONCURRENCY=2 as const;

export type SemanticQueueFailure<T>={item:T;reason:unknown};
export type SemanticQueueResult<T>={
 completed:number;failures:SemanticQueueFailure<T>[];cancelled:boolean
};

/** Work-conserving two-worker queue. A failure stops NEW dispatches without
 * aborting the other in-flight NVIDIA request, so its successful evidence can
 * still be checkpointed. Abort cancels both via the same signal.
 */
export async function runSemanticQueue<T>({
 items,signal,process
}:{
 items:readonly T[];signal:AbortSignal;process:(item:T)=>Promise<void>;
}):Promise<SemanticQueueResult<T>>{
 let index=0,completed=0,stopDispatch=false;
 const failures:SemanticQueueFailure<T>[]=[];
 async function worker(){
  while(!signal.aborted&&!stopDispatch){
   const next=index++;
   if(next>=items.length)return;
   const item=items[next];
   try{
    await process(item);
    if(signal.aborted)return;
    completed++;
   }catch(reason){
    if(signal.aborted)return;
    failures.push({item,reason});
    stopDispatch=true;
    return;
   }
  }
 }
 await Promise.all(Array.from({length:Math.min(SEMANTIC_CONCURRENCY,items.length)},
  ()=>worker()));
 return {completed,failures,cancelled:signal.aborted};
}
