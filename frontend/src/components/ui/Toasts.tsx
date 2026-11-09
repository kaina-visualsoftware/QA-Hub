import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {create} from "zustand";
import {AlertCircle,CheckCircle2,Info,TriangleAlert,X} from "lucide-react";

export type ToastTone="success"|"error"|"warning"|"info";
export type ToastEntry={
  id:number;
  message:string;
  tone:ToastTone;
  createdAt:number;
};
type ToastStore={
  items:ToastEntry[];
  show:(message:string,tone:ToastTone)=>void;
  dismiss:(id:number)=>void;
  clear:()=>void;
};

let nextId=0;
export const useToastStore=create<ToastStore>((set,get)=>({
  items:[],
  show:(raw,tone)=>{
    const message=raw.trim();
    if(!message)return;
    const now=Date.now();
    // StrictMode and repeated query renders must not create duplicate toasts.
    if(get().items.some(item=>item.message===message&&item.tone===tone&&
      now-item.createdAt<1500))return;
    const item={id:++nextId,message,tone,createdAt:now};
    set(state=>({items:[item,...state.items].slice(0,4)}));
  },
  dismiss:(id)=>set(state=>({items:state.items.filter(item=>item.id!==id)})),
  clear:()=>set({items:[]})
}));

export const notify={
  success:(message:string)=>useToastStore.getState().show(message,"success"),
  error:(message:string)=>useToastStore.getState().show(message,"error"),
  warning:(message:string)=>useToastStore.getState().show(message,"warning"),
  info:(message:string)=>useToastStore.getState().show(message,"info")
};

/** Convert an existing stateful notice into a single global toast. */
export function ToastNotice({message,tone="info"}:{
  message?:string|null; tone?:ToastTone;
}){
  useEffect(()=>{
    if(message)useToastStore.getState().show(message,tone);
  },[message,tone]);
  return null;
}

const icons={success:CheckCircle2,error:AlertCircle,warning:TriangleAlert,info:Info};
const labels={success:"Sucesso",error:"Erro",warning:"Atenção",info:"Informação"};

function ToastItem({item}:{item:ToastEntry}){
  const dismiss=useToastStore(state=>state.dismiss);
  const [paused,setPaused]=useState(false);
  useEffect(()=>{
    if(paused)return;
    const timeout=window.setTimeout(()=>dismiss(item.id),item.tone==="error"?9000:6000);
    return ()=>window.clearTimeout(timeout);
  },[dismiss,item.id,item.tone,paused]);
  const Icon=icons[item.tone];
  return <div className={"qa-toast qa-toast-"+item.tone}
    role={item.tone==="error"?"alert":"status"}
    onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)}
    onFocusCapture={()=>setPaused(true)}
    onBlurCapture={event=>{
      if(!event.currentTarget.contains(event.relatedTarget))setPaused(false);
    }}>
    <Icon className="qa-toast-icon" size={19} aria-hidden="true"/>
    <div className="qa-toast-body">
      <strong>{labels[item.tone]}</strong>
      <p>{item.message}</p>
    </div>
    <button type="button" aria-label={"Fechar notificação: "+labels[item.tone]}
      onClick={()=>dismiss(item.id)}>
      <X size={17} aria-hidden="true"/>
    </button>
  </div>;
}

/** Portal keeps notifications operable even while the app root is inert behind a modal. */
export function ToastCenter(){
  const items=useToastStore(state=>state.items);
  return createPortal(
    <div className="qa-toast-viewport" role="region" aria-label="Notificações do QA Hub">
      {items.map(item=><ToastItem key={item.id} item={item}/>)}
    </div>,
    document.body
  );
}
