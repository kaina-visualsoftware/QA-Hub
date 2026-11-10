export type PostOutputFormat = "markdown" | "bbcode";

/** Convert a normalized QA post to an editable forum post.
 * Never convert placeholder images into external URLs automatically.
 */
export function markdownToBbcode(markdown: string): string {
  const source = markdown.replace(/\r\n?/g, "\n").trim();
  const lines = source.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const text = line.trim();
    if (/^-{3,}$/.test(text)) { out.push("[hr]"); continue; }
    if (/^\[Imagem:\s*[^\]\n]+\]$/i.test(text)) {
      out.push("[i]" + text + "[/i]"); continue;
    }
    const heading = /^(#{1,5})\s+(.+)$/.exec(text);
    if (heading) {
      const size = heading[1].length === 1 ? 18 : 15;
      out.push("[size=" + size + "][b]" + heading[2] + "[/b][/size]");
      continue;
    }
    // Links only when HTTPS; do not turn arbitrary markdown into clickable URLs.
    let converted = line.replace(/\[([^\]\n]+)\]\((https:\/\/[^)\s]+)\)/gi,
      "[url=$2]$1[/url]");
    converted = converted.replace(/\*\*([^\n*]+)\*\*/g, "[b]$1[/b]")
      .replace(/(?<!\*)\*([^\n*]+)\*(?!\*)/g, "[i]$1[/i]");
    out.push(converted);
  }
  return out.join("\n").trim();
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
  return issues;
}
