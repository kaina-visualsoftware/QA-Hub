import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalFocus } from "../../lib/useModalFocus";

type QAModalProps = {
  open:boolean;
  title:string;
  description?:string;
  eyebrow?:string;
  children:ReactNode;
  onClose:()=>void;
  size?:"sm"|"md"|"lg"|"full";
  busy?:boolean;
  initialFocus?:string;
  keepMounted?:boolean;
  surface?:"post"|"diagram";
};

/**
 * Unified, accessible task-workspace overlay.
 * - Portalled outside #root so inert background never blocks its inputs.
 * - Escape, focus trap and focus restoration use the shared modal hook.
 * - Mobile takes the full viewport, desktop centers a scrollable dialog.
 * - No form data is discarded here: the caller owns close confirmation.
 */
export function QAModal({
  open,title,description,eyebrow="QA HUB",children,onClose,
  size="lg",busy=false,initialFocus,keepMounted=false,surface
}:QAModalProps){
  const [everOpened,setEverOpened]=useState(open);
  useEffect(()=>{if(open)setEverOpened(true);},[open]);
  const titleId=useId();
  const descriptionId=useId();
  const dialogRef=useModalFocus(open,()=>{if(!busy)onClose();},initialFocus);

  useEffect(()=>{
    if(!open)return;
    const root=document.getElementById("root");
    const previouslyInert=root?.inert ?? false;
    const previousOverflow=document.body.style.overflow;
    if(root)root.inert=true;
    document.body.style.overflow="hidden";
    return ()=>{
      if(root)root.inert=previouslyInert;
      document.body.style.overflow=previousOverflow;
    };
  },[open]);

  if(!open&&!(keepMounted&&everOpened))return null;
  return createPortal(
    <div className="qa-modal-backdrop" style={{display:open?"flex":"none"}}
      aria-hidden={!open} onMouseDown={(event)=>{
      if(!busy&&event.target===event.currentTarget)onClose();
    }}>
      <section ref={dialogRef} role="dialog" aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description?descriptionId:undefined}
        tabIndex={-1} className={"qa-modal qa-modal-"+size+(surface?" qa-modal-surface-"+surface:"")}>
        <header className="qa-modal-header">
          <div className="qa-modal-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
            {description&&<p id={descriptionId} className="qa-modal-description">{description}</p>}
          </div>
          <button type="button" className="qa-modal-close"
            aria-label={"Fechar "+title} disabled={busy} onClick={onClose}>
            <X size={20} aria-hidden="true"/>
          </button>
        </header>
        <div className="qa-modal-content">{children}</div>
      </section>
    </div>,document.body);
}
