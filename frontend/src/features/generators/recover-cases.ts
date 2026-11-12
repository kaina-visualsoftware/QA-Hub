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
 return onlyNewScenarioCandidates(cases).map(item=>({...item,selected:false}));
}
