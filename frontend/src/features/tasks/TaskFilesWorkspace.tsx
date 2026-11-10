import {useQuery,useQueryClient} from "@tanstack/react-query";
import {FileArchive,FileCheck2} from "lucide-react";
import type {Task,Scenario} from "../../lib/contracts";
import {listRequirementSources} from "../requirements/requirements-data";
import SourcesView from "../requirements/SourcesView";
import EvidencePanel from "../evidence/EvidencePanel";

/** Single read/create surface for all files attached to a TF.
 * Requirement source versions are never merged with execution evidence:
 * each category keeps its existing private storage and access controls.
 */
export default function TaskFilesWorkspace({task,userId,scenarios,
  prefillScenarioId,prefillRequest,readOnly=false,section="all"
}:{
  task:Task;userId:string;scenarios:Scenario[];
  prefillScenarioId?:string|null;prefillRequest?:number;readOnly?:boolean;
  section?:"all"|"sources"|"evidence";
}){
  const client=useQueryClient();
  const own=task.user_id===userId;
  const sources=useQuery({
    queryKey:["requirement-sources",userId,task.id],
    queryFn:()=>listRequirementSources(task.id),
    enabled:own
  });
  async function refresh(){
    await Promise.all([
      client.invalidateQueries({queryKey:["requirement-sources",userId,task.id]}),
      client.invalidateQueries({queryKey:["requirements",userId,task.id]}),
      client.invalidateQueries({queryKey:["gen-requirements",userId,task.id]})
    ]);
  }
  return <div className="qa-task-files-workspace">
    {section!=="evidence"&&<section className="qa-task-resource-group"
      aria-labelledby="qa-task-source-files-heading">
      <div className="qa-task-resource-group-heading">
        <FileArchive size={19} aria-hidden="true"/>
        <div>
          <h3 id="qa-task-source-files-heading">Documentos e fontes da TF</h3>
          <p>Arquivos originais, requisitos anexados e textos importados.
            Os documentos permanecem no armazenamento privado.</p>
        </div>
      </div>
      {own?<SourcesView task={task} userId={userId}
        records={sources.data??[]} loading={sources.isPending}
        error={sources.error?.message} onChanged={refresh} readOnly={readOnly}/>:
        <p className="notice error" role="alert">
          Os anexos privados desta TF só podem ser consultados pelo proprietário.
        </p>}
    </section>}
    {section!=="sources"&&<section className="qa-task-resource-group"
      aria-labelledby="qa-task-evidence-files-heading">
      <div className="qa-task-resource-group-heading">
        <FileCheck2 size={19} aria-hidden="true"/>
        <div>
          <h3 id="qa-task-evidence-files-heading">Evidências de execução</h3>
          <p>Capturas, logs, arquivos de validação e registros de auditoria.</p>
        </div>
      </div>
      <EvidencePanel task={task} userId={userId} scenarios={scenarios}
        prefillScenarioId={prefillScenarioId} prefillRequest={prefillRequest} readOnly={readOnly}/>
    </section>}
  </div>;
}
