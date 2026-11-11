export type PostOutputFormat = "markdown" | "bbcode";

/** Convert a normalized QA post to an editable forum post.
 * Never convert placeholder images into external URLs automatically.
 */
export function markdownToBbcode(markdown: string): string {
  const source = markdown.replace(/\r\n?/g, "\n").trim();
  const lines = source.split("\n");
  const out: string[] = [];
  let listKind: "ordered"|"unordered"|null = null;
  const inline=(value:string)=>value
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^)\s]+)\)/gi,"[url=$2]$1[/url]")
    .replace(/\*\*([^\n*]+)\*\*/g,"[b]$1[/b]")
    .replace(/(?<!\*)\*([^\n*]+)\*(?!\*)/g,"[i]$1[/i]");
  const closeList=()=>{if(listKind){out.push("[/list]");listKind=null;}};
  for(const line of lines){
    const text=line.trim();
    const ordered=/^\d{1,3}\.\s+(.+)$/.exec(text);
    const unordered=/^[-*]\s+(.+)$/.exec(text);
    if(ordered||unordered){
      const kind=ordered?"ordered":"unordered";
      if(listKind!==kind){closeList();out.push(ordered?"[list=1]":"[list]");listKind=kind;}
      out.push("[*]"+inline((ordered||unordered)?.[1]??""));
      continue;
    }
    closeList();
    if(/^-{3,}$/.test(text)){out.push("[hr]");continue;}
    if(/^\[Imagem:\s*[^\]\n]+\]$/i.test(text)){
      out.push("[i]"+text+"[/i]");continue;
    }
    const heading=/^(#{1,5})\s+(.+)$/.exec(text);
    if(heading){
      const size=heading[1].length===1?18:15;
      const title=heading[2].replace(/\*\*/g,"").trim();
      out.push("[size="+size+"][b]"+title+"[/b][/size]");
      continue;
    }
    out.push(inline(line));
  }
  closeList();
  return out.join("\n").trim();
}

/** Always format from canonical Markdown, not from a previously converted
 * or edited rendering. This prevents Markdown leaks after changing a format.
 */
export function renderPostFormat(markdown:string,format:PostOutputFormat):string{
  return format==="bbcode" ? markdownToBbcode(markdown) : markdown;
}

/** Validation matches the output language, not just the original prompt. */
export function validateBbcodePost(text: string): string[] {
  const issues: string[] = [];
  if (!/^\[size=\d+\]\[b\].+\[\/b\]\[\/size\]/m.test(text)) issues.push("Título");
  if (!/Anteriormente/i.test(text) || !/\bAgora\b|\bCom a nova funcionalidade\b/i.test(text))
    issues.push("Comparação Antes/Depois");
  if (!/\[b\]Caminho de acesso:\[\/b\]/i.test(text)) issues.push("Caminho de acesso");
  if (!/\[i\]\[Imagem:\s*[^\]\n]+\]\[\/i\]/i.test(text)) issues.push("Marcador de imagem");
  if (!/\[b\]Comportamento detalhado\[\/b\]/i.test(text)) issues.push("Comportamento detalhado");
  if (!/\[b\]TAREFA:\[\/b\]/i.test(text)) issues.push("TAREFA");
  if (!/\[b\]JUSTIFICATIVA:\[\/b\]/i.test(text)) issues.push("JUSTIFICATIVA");
  if (/^\s*#{1,6}\s+\S/m.test(text) || /\*\*[^\n*]+\*\*/.test(text))
    issues.push("Sintaxe Markdown no BBCode");
  return issues;
}
