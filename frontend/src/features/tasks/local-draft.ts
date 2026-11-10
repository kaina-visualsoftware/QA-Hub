import { z } from "zod";
import type { TaskDraft } from "../../lib/contracts";

// The QA task description may contain sensitive internal information.
// Browser persistence is explicit opt-in, tab-scoped, and never localStorage.
const draftFieldsSchema = z.object({
  titulo: z.string().max(240),
  descricao: z.string(),
  tipo_teste: z.enum(["BUILD", "RELEASE"]),
  codigo: z.string().max(100),
  sistema: z.string().max(160),
  versao: z.string().max(100)
}).strict();

const storedDraftSchema = z.object({
  version: z.literal(1),
  ownerId: z.uuid(),
  savedAt: z.number().int().nonnegative(),
  fields: draftFieldsSchema
}).strict();

export type StoredNewTaskDraft = z.infer<typeof storedDraftSchema>;
export type NewTaskDraftFields = StoredNewTaskDraft["fields"];

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const prefix = "qa-react-new-task-draft:v1:";

function getStorage(storage?: DraftStorage): DraftStorage | null {
  if (storage) return storage;
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; }
  catch { return null; }
}

function key(userId: string) { return prefix + userId; }

export function pickNewTaskFields(values: TaskDraft): NewTaskDraftFields {
  return draftFieldsSchema.parse({
    titulo: values.titulo,
    descricao: values.descricao,
    tipo_teste: values.tipo_teste,
    codigo: values.codigo,
    sistema: values.sistema,
    versao: values.versao
  });
}

export function saveNewTaskDraft(
  userId: string, values: TaskDraft, storage?: DraftStorage, now = Date.now()
): boolean {
  const store = getStorage(storage);
  if (!store || !z.uuid().safeParse(userId).success) return false;
  try {
    const payload: StoredNewTaskDraft = storedDraftSchema.parse({
      version: 1, ownerId: userId, savedAt: now, fields: pickNewTaskFields(values)
    });
    store.setItem(key(userId), JSON.stringify(payload));
    return true;
  } catch {
    // Private browsing and browser storage quota may prohibit saving.
    return false;
  }
}

export function loadNewTaskDraft(
  userId: string, storage?: DraftStorage, now = Date.now()
): StoredNewTaskDraft | null {
  const store = getStorage(storage);
  if (!store || !z.uuid().safeParse(userId).success) return null;
  try {
    const raw = store.getItem(key(userId));
    if (!raw) return null;
    const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.ownerId !== userId
      || parsed.data.savedAt > now || now - parsed.data.savedAt > MAX_AGE_MS) {
      store.removeItem(key(userId));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function discardNewTaskDraft(userId: string, storage?: DraftStorage): void {
  const store = getStorage(storage);
  if (!store || !z.uuid().safeParse(userId).success) return;
  try { store.removeItem(key(userId)); } catch { /* storage blocked */ }
}
