import { Button } from "@heroui/react";
import { Trash2 } from "lucide-react";
import { QAModal } from "../../components/ui/QAModal";
import { ToastNotice } from "../../components/ui/Toasts";
import type { Task } from "../../lib/contracts";

type DeletedTask = Pick<Task, "id" | "titulo" | "codigo">;

type Props = {
  task: DeletedTask | null;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  scenarioCount?: number;
};

/** A single confirmation flow for deleting a TF from the list or its detail page. */
export function DeleteTaskDialog({
  task, busy, error, onClose, onConfirm, scenarioCount
}: Props) {
  return <QAModal open={!!task} size="sm"
    eyebrow="AÇÃO IRREVERSÍVEL" title="Excluir esta TF?"
    description="Confirme antes de excluir a tarefa e seus dados relacionados."
    onClose={onClose} busy={busy} initialFocus=".qa-task-delete-cancel">
    <p className="qa-task-delete-label">Tarefa selecionada</p>
    <div className="qa-task-delete-target">
      <strong>{task?.titulo}</strong>
      {task?.codigo && <small>TF {task.codigo}</small>}
    </div>
    <p className="qa-task-delete-warning">
      Esta exclusão é permanente. Os cenários e outros registros vinculados à TF
      também poderão ser removidos.
      {scenarioCount !== undefined && scenarioCount > 0 &&
        <> A tarefa possui <strong>{scenarioCount} cenário(s)</strong>.</>}
    </p>
    <ToastNotice tone="error" message={error}/>
    <div className="qa-task-delete-actions">
      <Button variant="secondary" className="qa-task-delete-cancel" isDisabled={busy}
        onPress={onClose}>Cancelar</Button>
      <button type="button" className="qa-task-delete-confirm" disabled={busy || !task}
        onClick={onConfirm}>
        <Trash2 size={16} aria-hidden="true"/>
        {busy ? "Excluindo…" : "Excluir definitivamente"}
      </button>
    </div>
  </QAModal>;
}
