import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { validateStagingConfig, mustSeeOne, mustNotSee, validateStoragePath } from "./staging-rls-guards.mjs";

// Operates exclusively on a separately confirmed staging project. Does not
// mutate QA tables, Storage objects, RPC data, RLS rules, or user accounts.
const cfg = validateStagingConfig(process.env);
const client = () => createClient(cfg.url, cfg.key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const anon = client(), a = client(), b = client();
let passed = 0;
function done(label) { passed++; console.log("PASS " + label); }
function rows(c, table, column, value, selection = "id") {
  return c.from(table).select(selection).eq(column, value).limit(1);
}
async function visible(c, table, col, id, label) {
  mustSeeOne(await rows(c, table, col, id), label, id);
  done(label);
}
async function hidden(c, table, col, id, label) {
  mustNotSee(await rows(c, table, col, id), label);
  done(label);
}
async function childrenVisible(c, table, taskId, label) {
  const { data, error } = await rows(c, table, "tarefa_id", taskId);
  if (error || data?.length !== 1)
    throw Error(label + ": no accessible staging fixture child row.");
  done(label);
}
async function ownerTask(c, id, owner, published, label) {
  const result = await rows(c, "qa_tarefas", "id", id, "id,user_id,publica");
  mustSeeOne(result, label, id);
  assert.equal(result.data[0].user_id, owner, label + ": incorrect fixture owner.");
  assert.equal(result.data[0].publica, published, label + ": wrong publication state.");
  done(label);
}
async function login(c, email, password, label) {
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data?.user || !data.session)
    throw Error(label + ": staging account login failed.");
  const verification = await c.auth.getUser();
  if (verification.error || verification.data.user?.id !== data.user.id)
    throw Error(label + ": Auth server session verification failed.");
  const admins = await rows(c, "qa_admins", "user_id", data.user.id);
  if (admins.error || (admins.data?.length ?? 0) !== 0)
    throw Error(label + ": test user must not have admin privileges.");
  done(label + " verified non-admin session");
  return data.user.id;
}
async function storage(path, ownedBy, outsider, ownerId, taskId, label) {
  if (!validateStoragePath(path, ownerId, taskId))
    throw Error(label + ": fixture path must belong to the signed-in owner and TF.");
  const prefix = ownerId + "/" + taskId;
  const filename = path.split("/")[2];
  async function list(c) {
    return c.storage.from("qa-requisitos").list(prefix, { limit: 100 });
  }
  const own = await list(ownedBy);
  if (own.error || !own.data?.some((item) => item.name === filename))
    throw Error(label + ": private object missing from owner listing (limit: 100).");
  done(label + " is visible to owner");
  for (const [reader, role] of [[outsider, "non-owner"], [anon, "anonymous"]]) {
    const check = await list(reader);
    if (check.error) {
      const code = String(check.error.statusCode || check.error.status || check.error.code || "");
      if (!["401", "403", "42501"].includes(code)) {
        throw Error(label + ": unexpected Storage error for " + role + ".");
      }
    } else if (check.data?.some((item) => item.name === filename)) {
      throw Error(label + ": private object visible to " + role + ".");
    }
    done(label + " hidden from " + role);
  }
}
const PUBLIC_CARD_KEYS = [
  "id","titulo","codigo","tipo_teste","sistema","versao","executado_em"
];
const PUBLIC_DETAIL_KEYS = [
  ...PUBLIC_CARD_KEYS,"status","descricao","explicacao","causa","correcao",
  "conclusao","observacoes"
];
const PUBLIC_SCENARIO_KEYS = [
  "id","titulo","ordem","passos","esperado","obtido","observacoes","status"
];
const PUBLIC_DIAGRAM_KEYS = ["id","titulo","conteudo"];
function exactPublicKeys(row, keys, label) {
  assert.ok(row && typeof row === "object" && !Array.isArray(row),
    label + ": expected JSON object.");
  assert.deepEqual(Object.keys(row).sort(), [...keys].sort(),
    label + ": public data projection must expose ONLY allowlisted columns.");
}
async function publicProjection(c, label) {
  const listed = await c.rpc("qa_public_tasks_v1");
  if (listed.error || !Array.isArray(listed.data))
    throw Error(label + ": published list RPC is unavailable.");
  for (const item of listed.data) exactPublicKeys(item, PUBLIC_CARD_KEYS, label + " list");
  assert.ok(listed.data.some((item) => item.id === cfg.publicA),
    label + ": published fixture missing from public RPC.");
  assert.ok(!listed.data.some((item) => item.id === cfg.taskA || item.id === cfg.taskB),
    label + ": private fixture leaked in public list.");
  done(label + " public list has allowlisted fields");

  const detailed = await c.rpc("qa_public_task_v1", {p_task_id: cfg.publicA});
  if (detailed.error || !detailed.data)
    throw Error(label + ": published detail RPC is unavailable.");
  exactPublicKeys(detailed.data.task, PUBLIC_DETAIL_KEYS, label + " detail");
  assert.equal(detailed.data.task.id, cfg.publicA);
  if (!Array.isArray(detailed.data.scenarios) || !Array.isArray(detailed.data.diagrams))
    throw Error(label + ": published children must be arrays.");
  detailed.data.scenarios.forEach((row) =>
    exactPublicKeys(row, PUBLIC_SCENARIO_KEYS, label + " scenario"));
  detailed.data.diagrams.forEach((row) =>
    exactPublicKeys(row, PUBLIC_DIAGRAM_KEYS, label + " diagram"));
  done(label + " public detail has allowlisted fields");

  for (const privateId of [cfg.taskA, cfg.taskB]) {
    const unseen = await c.rpc("qa_public_task_v1", {p_task_id: privateId});
    if (unseen.error || unseen.data !== null)
      throw Error(label + ": private TF available through published detail RPC.");
    done(label + " cannot read private TF via RPC");
  }
}
async function noInternalMetadataLeak(c, label) {
  const result = await rows(c, "qa_tarefas", "id", cfg.publicA,
    "id,user_id,empresa,base_teste,testador");
  mustNotSee(result, label);
  done(label);
}
try {
  const uidA = await login(a, cfg.emailA, cfg.passA, "A");
  const uidB = await login(b, cfg.emailB, cfg.passB, "B");
  assert.notEqual(uidA, uidB, "Account A/B must represent distinct users.");

  await ownerTask(a, cfg.taskA, uidA, false, "A owns private TF");
  await ownerTask(b, cfg.taskB, uidB, false, "B owns private TF");
  await ownerTask(a, cfg.publicA, uidA, true, "A owns published TF");

  for (const [reader, label, taskId] of [
    [b, "B cannot read private A", cfg.taskA],
    [anon, "Guest cannot read private A", cfg.taskA],
    [a, "A cannot read private B", cfg.taskB],
    [anon, "Guest cannot read private B", cfg.taskB]
  ]) await hidden(reader, "qa_tarefas", "id", taskId, label);

  for (const [owner, outsider, taskId, label] of [
    [a, b, cfg.taskA, "A"], [b, a, cfg.taskB, "B"]
  ]) {
    for (const table of ["qa_cenarios", "qa_diagramas"]) {
      await childrenVisible(owner, table, taskId, label + " child: " + table);
      await hidden(outsider, table, "tarefa_id", taskId, label + " child hidden from other: " + table);
      await hidden(anon, table, "tarefa_id", taskId, label + " child hidden from guest: " + table);
    }
    for (const table of ["qa_documentos", "qa_requisito_fontes", "qa_requisitos"]) {
      await hidden(outsider, table, "tarefa_id", taskId, label + " private internals: " + table);
      await hidden(anon, table, "tarefa_id", taskId, label + " anonymous internals: " + table);
    }
  }

  for (const [reader, label] of [[anon, "Anonymous"], [b, "Signed-in non-owner"]]) {
    await publicProjection(reader, label);
    await hidden(reader, "qa_tarefas", "id", cfg.publicA,
      label + " cannot SELECT published TF from base table");
    for (const table of ["qa_cenarios", "qa_diagramas"]) {
      await hidden(reader, table, "tarefa_id", cfg.publicA,
        label + " cannot SELECT published children from base table: " + table);
    }
    for (const table of ["qa_documentos", "qa_requisito_fontes", "qa_requisitos"]) {
      await hidden(reader, table, "tarefa_id", cfg.publicA,
        label + " cannot read internal " + table + " for published TF");
    }
  }

  if (!cfg.attachmentA || !cfg.attachmentB)
    throw Error("Storage validation requires both owner-specific attachment fixture paths.");
  await storage(cfg.attachmentA, a, b, uidA, cfg.taskA, "Private attachment A");
  await storage(cfg.attachmentB, b, a, uidB, cfg.taskB, "Private attachment B");

  await noInternalMetadataLeak(anon, "Published TF internal metadata denied to guest");
  await noInternalMetadataLeak(b, "Published TF internal metadata denied to non-owner");
  for (const table of ["qa_cenarios", "qa_diagramas"]) {
    for (const [reader, label] of [[anon, "guest"], [b, "non-owner"]]) {
      const raw = await rows(reader, table, "tarefa_id", cfg.publicA,
        "id,user_id,tarefa_id");
      mustNotSee(raw, "Published " + table + " user_id hidden from " + label);
      done("Published " + table + " internal owner ID hidden from " + label);
    }
  }

  console.log("Staging RLS: " + passed +
    " checks passed. QA data and Storage were never modified.");
} catch (error) {
  // No fixture values, identifiers, URLs, emails or tokens are printed.
  console.error("FAIL RLS staging:", error instanceof Error ? error.message : "Unexpected error.");
  process.exitCode = 1;
} finally {
  await Promise.allSettled([
    a.auth.signOut({ scope: "local" }), b.auth.signOut({ scope: "local" })
  ]);
}
