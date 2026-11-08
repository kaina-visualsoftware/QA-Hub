import {taskStatusLabels} from "../../lib/contracts";
import type {Scenario,Task} from "../../lib/contracts";
import type {EvidenceFile} from "../evidence/evidence-files";
import {executionSummary} from "../../lib/legacy/qa-phase2.mjs";

// Uses a lazily loaded PDF library: the normal QA workspace stays lightweight.
// Source of truth remains persisted scenarios and the user's reviewed text.
export async function buildQaReportPdf({
  task,scenarios,content,files=[],generatedAt=new Date()
}:{
  task:Task;scenarios:Scenario[];content:string;
  files?:EvidenceFile[];generatedAt?:Date;
}):Promise<Uint8Array> {
  if(!task.id||!content.trim()||content.length>80000)
    throw Error("Relatório vazio ou acima do limite de 80.000 caracteres.");
  const {PDFDocument,StandardFonts,rgb}=await import("pdf-lib");
  const pdf=await PDFDocument.create();
  pdf.setTitle("Relatório de QA — "+task.titulo.slice(0,150));
  pdf.setSubject("Resultados de teste registrados para TF "+(task.codigo||task.id));
  pdf.setCreator("QA Hub");
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,H=841.89,margin=44,bodyWidth=W-2*margin,bottom=66;
  const dark=rgb(.12,.27,.32),teal=rgb(.1,.43,.45),muted=rgb(.34,.43,.47);
  const pale=rgb(.92,.96,.95),divider=rgb(.82,.88,.88);
  let page=pdf.addPage([W,H]),y=H-margin;
  function latin(text:string){
    return String(text??"").normalize("NFC")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g," ")
      .replace(/[\u2010-\u2015]/g,"-")
      .replace(/[\u2018\u2019]/g,"'")
      .replace(/[\u201c\u201d]/g,'"')
      .replace(/\u2026/g,"...")
      .replace(/[\u2190-\u21ff]/g,"->")
      .replace(/[^\u0020-\u00ff]/g,"?");
  }
  function nextPage(){
    page=pdf.addPage([W,H]);y=H-margin;
  }
  function space(h:number){
    if(y-h<bottom)nextPage();
  }
  function rule(){
    space(14);page.drawLine({start:{x:margin,y},end:{x:W-margin,y},
      thickness:1,color:divider});y-=14;
  }
  function line(text:string,size=10,strong=false,color=dark,indent=0){
    const f=strong?bold:font;
    const words=latin(text).split(/\s+/).filter(Boolean);
    if(!words.length){y-=size*.55;return;}
    const width=bodyWidth-indent;
    let current="";
    const flush=()=>{
      if(!current)return;
      space(size+6);
      page.drawText(current,{x:margin+indent,y,size,font:f,color});
      y-=size+5;
      current="";
    };
    for(const word of words){
      let wordPart=word;
      // Split long URLs/identifiers without losing characters or clipping.
      if(f.widthOfTextAtSize(wordPart,size)>width){
        flush();
        while(wordPart.length){
          let lower=1,upper=wordPart.length,fit=1;
          while(lower<=upper){
            const n=Math.floor((lower+upper)/2);
            if(f.widthOfTextAtSize(wordPart.slice(0,n),size)<=width){
              fit=n;lower=n+1;
            } else upper=n-1;
          }
          current=wordPart.slice(0,fit);flush();wordPart=wordPart.slice(fit);
        }
        continue;
      }
      const candidate=current?current+" "+wordPart:wordPart;
      if(f.widthOfTextAtSize(candidate,size)>width&&current)flush();
      current=current?current+" "+wordPart:wordPart;
    }
    flush();
  }
  function section(title:string){
    y-=9;space(32);
    line(title,13,true,teal);y-=2;
  }
  function labelValue(label:string,value:string){
    line(label+": "+(value.trim()||"Não informado"),9.3,false,muted);
  }
  function header(){
    page.drawRectangle({x:margin,y:y-29,width:bodyWidth,height:34,color:pale});
    page.drawText("QA HUB  /  RELATÓRIO DE EXECUÇÃO",{
      x:margin+12,y:y-21,size:11,font:bold,color:teal
    });y-=57;
    line(task.titulo,19,true,dark);
    if(task.codigo)line("TF "+task.codigo,10,true,teal);
    y-=11;
    labelValue("Tipo",task.tipo_teste);
    labelValue("Módulo",task.sistema||"");
    labelValue("Versão",task.versao||"");
    labelValue("Situação registrada",taskStatusLabels[task.status]);
    labelValue("Gerado em",generatedAt.toLocaleString("pt-BR"));
    rule();
  }
  header();
  const c=executionSummary(scenarios);
  section("Indicadores");
  const cells=[
    ["Total",c.total],["Aprovados",c.aprovado],
    ["Reprovados",c.reprovado],["Bloqueados",c.bloqueado],
    ["Pendentes",c.nao_executado]
  ] as const;
  const w=bodyWidth/cells.length,boxY=y-46;
  space(57);
  cells.forEach(([label,count],i)=>{
    const x=margin+i*w;
    page.drawRectangle({x:x+2,y:boxY,width:w-4,height:45,color:pale});
    page.drawText(String(count),{x:x+9,y:boxY+22,size:16,font:bold,color:teal});
    page.drawText(label,{x:x+9,y:boxY+8,size:8,font,color:muted});
  });
  y-=63;
  section("Evidências anexadas");
  line(files.length+" arquivo(s) privados vinculados à TF.",9.7);
  if(files.length){
    for(const f of files.slice(0,100)){
      line("- "+f.nome_original+
        (f.descricao ? " - "+f.descricao.slice(0,120):""),9,false,muted,8);
    }
  }
  line("Os arquivos não são incorporados ao PDF. Consulte os originais no QA Hub.",8.5,
    false,muted);
  rule();
  section("Relatório revisado");
  for(const sourceLine of content.replace(/\r/g,"").split("\n")){
    const text=sourceLine.trim();
    if(!text){y-=5;continue;}
    if(text.startsWith("### "))line(text.slice(4),10.3,true,dark);
    else if(text.startsWith("## "))section(text.slice(3));
    else if(text.startsWith("# "))section(text.slice(2));
    else if(text.startsWith("> "))line(text.slice(2),9,false,muted,9);
    else if(text.startsWith("- "))line("- "+text.slice(2),9.4,false,dark,7);
    else if(/^\*\*[^*]+:\*\*/.test(text))line(text.replaceAll("**",""),9.4);
    else line(text.replaceAll("**",""),9.4);
  }
  const total=pdf.getPageCount();
  pdf.getPages().forEach((sheet,index)=>{
    sheet.drawLine({start:{x:margin,y:43},end:{x:W-margin,y:43},
      thickness:.7,color:divider});
    sheet.drawText("QA Hub · Exportação local · Não altera o resultado da TF",{
      x:margin,y:28,size:8,font,color:muted
    });
    const pageText=(index+1)+" / "+total;
    sheet.drawText(pageText,{x:W-margin-font.widthOfTextAtSize(pageText,8),
      y:28,size:8,font,color:muted});
  });
  return pdf.save();
}
