import {onlyNewScenarioCandidates,parseGeneratedCases} from "../../lib/legacy/qa-workspace.mjs";
import type {GeneratedCase} from "../../lib/legacy/qa-workspace.mjs";
import type {GeneratorCheckpoint} from "./batched-stream";

/** Only closed, structurally complete cases from an interrupted SSE are
 * offered for manual review. A trailing case with no next heading may have
 * been cut in the middle of its expected result, so it is never auto-added.
 */
export function recoverCompletedCases(checkpoint:GeneratorCheckpoint):GeneratedCase[]{
 if(checkpoint.mode!=="teste")return [];
 const completed=checkpoint.sections.join("\n\n");
 const partial=checkpoint.partial;
 const headers=[...partial.matchAll(/^##[ \t]+Cen[aá]rio\b[^\n]*$/gim)];
 let safePartial=partial;
 if(headers.length){
  const last=headers.at(-1)!;
  const tail=partial.slice(last.index!+last[0].length);
  // A following ## section or separator is an explicit boundary; otherwise
  // the final scenario is still in flight, even when its fields look filled.
  const closed=/(?:^##[ \t]+(?!Cen[aá]rio\b)|^---[ \t]*$)/im.test(tail);
  if(!closed)safePartial=partial.slice(0,last.index);
 }
 const markdown=[completed,safePartial].filter(Boolean).join("\n\n");
 const cases=parseGeneratedCases(markdown)
  .filter(item=>item.titulo.trim().length>=3&&
   item.passos.trim().length>0&&item.esperado.trim().length>0);
 return onlyNewScenarioCandidates(cases,[]).map(item=>({...item,selected:false}));
}

/** A case title is editable before an interrupted request is resumed. The
 * untouched steps and expectation still identify that existing proposal.
 * Replaying the same incomplete stage must not add the original AI title as
 * a second case next to the human-renamed one.
 */
export function onlyNewResumedCases(candidates:GeneratedCase[],
 saved:Pick<GeneratedCase,"titulo"|"passos"|"esperado">[],
 pending:Pick<GeneratedCase,"titulo"|"passos"|"esperado">[]):GeneratedCase[]{
 const normalize=(value:string)=>String(value??"").normalize("NFKC")
  .replace(/\s+/g," ").trim().toLocaleLowerCase("pt-BR");
 const fingerprint=(item:Pick<GeneratedCase,"passos"|"esperado">)=>
  normalize(item.passos)+"\u241f"+normalize(item.esperado);
 const reviewed=new Set(pending.map(fingerprint));
 return onlyNewScenarioCandidates(candidates,[...saved,...pending])
  .filter(item=>!reviewed.has(fingerprint(item)));
}
