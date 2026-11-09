import {useEffect,useMemo,useRef,useState} from "react";
import type {PointerEvent} from "react";
import {Maximize2,Minus,Plus,Scan} from "lucide-react";

const MIN_ZOOM=0.5;
const MAX_ZOOM=3;
const STEP=0.25;

/** Read-only diagram surface. The generated SVG stays inside an inert iframe. */
function dimensions(svg:string){
  const raw=svg.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  const values=raw?.trim().split(/[\s,]+/).map(Number);
  if(values?.length===4&&values.every(Number.isFinite)&&values[2]>0&&values[3]>0){
    return {width:values[2],height:values[3]};
  }
  return {width:1200,height:750};
}

function isolatedDocument(svg:string){
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '+
      'style-src \'unsafe-inline\'; img-src data: blob:; font-src data:;">'+
    '<style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff}'+
    'body{display:flex;align-items:center;justify-content:center}'+
    'body>svg{width:100%!important;height:100%!important;max-width:none!important;display:block}'+
    '</style></head><body>'+svg+'</body></html>';
}

export function DiagramViewer({svg,title}:{svg:string;title:string}){
  const [zoom,setZoom]=useState(1);
  const [dragging,setDragging]=useState(false);
  const viewport=useRef<HTMLDivElement>(null);
  const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const doc=useMemo(()=>isolatedDocument(svg),[svg]);
  const {width,height}=useMemo(()=>dimensions(svg),[svg]);

  // Center the diagram when the modal opens and after changing zoom.
  // If the artwork exceeds the viewport, start in its central region.
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      const node=viewport.current;
      if(!node)return;
      node.scrollLeft=Math.max(0,(node.scrollWidth-node.clientWidth)/2);
      node.scrollTop=Math.max(0,(node.scrollHeight-node.clientHeight)/2);
    });
    return ()=>cancelAnimationFrame(frame);
  },[zoom,svg]);

  function changeZoom(delta:number){
    setZoom(current=>Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,
      Math.round((current+delta)*100)/100)));
  }
  function fit(){setZoom(1);}
  function onPointerDown(event:PointerEvent<HTMLDivElement>){
    if(event.pointerType!=="mouse"||event.button!==0)return;
    const node=event.currentTarget;
    if(node.scrollWidth<=node.clientWidth&&node.scrollHeight<=node.clientHeight)return;
    drag.current={x:event.clientX,y:event.clientY,left:node.scrollLeft,top:node.scrollTop};
    node.setPointerCapture(event.pointerId);
    setDragging(true);
  }
  function onPointerMove(event:PointerEvent<HTMLDivElement>){
    if(!drag.current)return;
    event.currentTarget.scrollLeft=drag.current.left-(event.clientX-drag.current.x);
    event.currentTarget.scrollTop=drag.current.top-(event.clientY-drag.current.y);
  }
  function onPointerEnd(event:PointerEvent<HTMLDivElement>){
    drag.current=null;setDragging(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId)){
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return <div className="qa-diagram-viewer qa-diagram-viewer--expanded">
    <div className="qa-diagram-viewer-toolbar" role="group"
      aria-label={"Controles de visualização de "+title}>
      <span className="qa-diagram-viewer-help">
        Diagrama centralizado · escala inicial 100%
      </span>
      <div className="qa-diagram-viewer-tools">
        <button type="button" title="Diminuir zoom" aria-label="Diminuir zoom"
          disabled={zoom<=MIN_ZOOM} onClick={()=>changeZoom(-STEP)}>
          <Minus size={17} aria-hidden="true"/>
        </button>
        <output className="qa-diagram-zoom-value" aria-live="polite"
          aria-label="Nível de zoom">{Math.round(zoom*100)+"%"}</output>
        <button type="button" title="Aumentar zoom" aria-label="Aumentar zoom"
          disabled={zoom>=MAX_ZOOM} onClick={()=>changeZoom(STEP)}>
          <Plus size={17} aria-hidden="true"/>
        </button>
        <button type="button" title="Voltar para 100%" aria-label="Voltar para 100%"
          onClick={fit}><Scan size={17} aria-hidden="true"/></button>
      </div>
    </div>
    <div ref={viewport}
      className={"qa-diagram-stage"+(dragging?" is-dragging":"")}
      role="region" tabIndex={0} aria-label={"Área de visualização do diagrama "+title}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
      <div className="qa-diagram-zoom-layer" style={{
        width:Math.max(1,width*zoom)+"px",height:Math.max(1,height*zoom)+"px"
      }}>
        <iframe className="qa-diagram-viewer-frame"
          title={"Diagrama: "+title} sandbox="" referrerPolicy="no-referrer"
          srcDoc={doc}/>
      </div>
    </div>
    <p className="qa-diagram-viewer-caption">
      <Maximize2 size={13} aria-hidden="true"/>
      Zoom de 50% a 300%. Arraste com o mouse, deslize na tela ou use as setas.
    </p>
  </div>;
}

