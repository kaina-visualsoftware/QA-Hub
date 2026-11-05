// Accessible, dependency-free pan/zoom controller for Mermaid SVG previews.
export function createDiagramViewer(dialog){
  const viewport=dialog.querySelector('#diagram-viewer-viewport');
  const art=dialog.querySelector('#diagram-viewer-art');
  const label=dialog.querySelector('#diagram-zoom-label');
  const title=dialog.querySelector('#diagram-viewer-title');
  const state={scale:1,x:0,y:0,width:1000,height:650,pointer:null};
  const clamp=(value)=>Math.min(5,Math.max(.15,value));
  function draw(){
    art.style.transform='translate('+state.x+'px,'+state.y+'px) scale('+state.scale+')';
    label.textContent=Math.round(state.scale*100)+'%';
  }
  function setZoom(scale,point){
    scale=clamp(scale);
    const cx=point?.x??viewport.clientWidth/2,cy=point?.y??viewport.clientHeight/2;
    state.x=cx-(cx-state.x)*(scale/state.scale);
    state.y=cy-(cy-state.y)*(scale/state.scale);
    state.scale=scale;
    draw();
  }
  function fit(){
    const width=viewport.clientWidth,height=viewport.clientHeight;
    if(!width||!height)return;
    state.scale=clamp(Math.min((width-44)/state.width,(height-44)/state.height,2));
    state.x=(width-state.width*state.scale)/2;
    state.y=(height-state.height*state.scale)/2;
    draw();
  }
  function open(svg,titleText='Diagrama'){
    if(typeof svg!=='string'||!svg.includes('<svg'))throw Error('O diagrama ainda não está disponível.');
    art.innerHTML=svg;
    const node=art.querySelector('svg');
    if(!node)throw Error('Não foi possível abrir este diagrama.');
    const view=node.viewBox?.baseVal;
    const width=view?.width||parseFloat(node.getAttribute('width'))||1000;
    const height=view?.height||parseFloat(node.getAttribute('height'))||650;
    state.width=Math.min(10000,Math.max(80,width));
    state.height=Math.min(10000,Math.max(80,height));
    art.style.width=state.width+'px';
    art.style.height=state.height+'px';
    node.style.width='100%';
    node.style.height='100%';
    node.style.maxWidth='none';
    title.textContent=titleText;
    if(!dialog.open)dialog.showModal();
    requestAnimationFrame(fit);
  }
  dialog.querySelectorAll('[data-viewer]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.viewer;
    if(action==='close')dialog.close();
    if(action==='plus')setZoom(state.scale*1.25);
    if(action==='minus')setZoom(state.scale/1.25);
    if(action==='actual')setZoom(1);
    if(action==='fit')fit();
  }));
  viewport.addEventListener('wheel',event=>{
    event.preventDefault();
    const bounds=viewport.getBoundingClientRect();
    setZoom(state.scale*Math.exp(-event.deltaY*.0012),
      {x:event.clientX-bounds.left,y:event.clientY-bounds.top});
  },{passive:false});
  viewport.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    state.pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove',event=>{
    if(!state.pointer||state.pointer.id!==event.pointerId)return;
    state.x+=event.clientX-state.pointer.x;
    state.y+=event.clientY-state.pointer.y;
    state.pointer.x=event.clientX;state.pointer.y=event.clientY;
    draw();
  });
  function endPointer(event){
    if(state.pointer?.id!==event.pointerId)return;
    state.pointer=null;
    viewport.classList.remove('dragging');
  }
  viewport.addEventListener('pointerup',endPointer);
  viewport.addEventListener('pointercancel',endPointer);
  viewport.addEventListener('dblclick',fit);
  viewport.addEventListener('keydown',event=>{
    if(!dialog.open)return;
    if(['+','='].includes(event.key)){event.preventDefault();setZoom(state.scale*1.25);}
    else if(event.key==='-'){event.preventDefault();setZoom(state.scale/1.25);}
    else if(event.key==='0'){event.preventDefault();fit();}
    else if(event.key.startsWith('Arrow')){
      event.preventDefault();
      if(event.key==='ArrowLeft')state.x+=32;
      if(event.key==='ArrowRight')state.x-=32;
      if(event.key==='ArrowUp')state.y+=32;
      if(event.key==='ArrowDown')state.y-=32;
      draw();
    }
  });
  dialog.addEventListener('close',()=>{
    state.pointer=null;
    viewport.classList.remove('dragging');
  });
  return {open,fit,setZoom,getState:()=>({...state})};
}
