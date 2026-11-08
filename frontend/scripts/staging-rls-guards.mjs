import assert from "node:assert/strict";

export const PRODUCTION_PROJECT_REF = "pqadmlhcsimlcclpkyov";
const CONFIRM = "READ_ONLY_STAGING";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PROJECT_URL = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/;
export const REQUIRED_STAGING_ENV = Object.freeze([
  "QA_STAGING_URL", "QA_STAGING_EXPECTED_REF", "QA_STAGING_PUBLISHABLE_KEY",
  "QA_STAGING_EMAIL_A", "QA_STAGING_PASSWORD_A",
  "QA_STAGING_EMAIL_B", "QA_STAGING_PASSWORD_B",
  "QA_STAGING_PRIVATE_TASK_A", "QA_STAGING_PRIVATE_TASK_B",
  "QA_STAGING_PUBLIC_TASK_A"
]);

/** Validate before creating clients or making any request; no secrets in errors. */
export function validateStagingConfig(env) {
  if (env.QA_STAGING_CONFIRM !== CONFIRM)
    throw Error("Staging RLS test requires explicit READ_ONLY_STAGING confirmation.");
  const missing = REQUIRED_STAGING_ENV.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw Error("Staging configuration missing: " + missing.join(", "));
  const match = env.QA_STAGING_URL.match(PROJECT_URL);
  if (!match) throw Error("Staging URL must be a direct HTTPS *.supabase.co project endpoint.");
  const ref = match[1];
  if (ref === PRODUCTION_PROJECT_REF)
    throw Error("Production Supabase project is explicitly forbidden for staging tests.");
  if (ref !== env.QA_STAGING_EXPECTED_REF)
    throw Error("Staging project ref differs from the explicitly configured expected ref.");
  const key = env.QA_STAGING_PUBLISHABLE_KEY;
  if (!key.startsWith("sb_publishable_")) {
    // Permit a legacy anon JWT only when its public role claim can be verified.
    if (key.split(".").length !== 3) throw Error("Only publishable/anon client keys are allowed.");
    let role = "";
    try {
      role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
    } catch { /* fail closed */ }
    if (role !== "anon") throw Error("Only publishable/anon client keys are allowed.");
  }
  for (const name of ["QA_STAGING_PRIVATE_TASK_A","QA_STAGING_PRIVATE_TASK_B","QA_STAGING_PUBLIC_TASK_A"]) {
    if (!UUID.test(env[name])) throw Error(name + " must be a UUID.");
  }
  const ids = ["QA_STAGING_PRIVATE_TASK_A","QA_STAGING_PRIVATE_TASK_B","QA_STAGING_PUBLIC_TASK_A"].map((k) =>
    env[k].toLowerCase());
  assert.equal(new Set(ids).size, 3, "Staging fixture task IDs must be distinct.");
  if (env.QA_STAGING_EMAIL_A.toLowerCase().trim() === env.QA_STAGING_EMAIL_B.toLowerCase().trim())
    throw Error("Staging accounts A and B must be different.");
  for (const [key, value] of Object.entries(env)) {
    if (/^(QA_STAGING_PRIVATE_ATTACHMENT_A|QA_STAGING_PRIVATE_ATTACHMENT_B)$/.test(key) && value) {
      if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx|txt|md)$/i.test(value))
        throw Error(key + " must follow userId/taskId/uuid.ext.");
    }
  }
  return Object.freeze({
    url: env.QA_STAGING_URL, key, projectRef: ref,
    emailA: env.QA_STAGING_EMAIL_A, passA: env.QA_STAGING_PASSWORD_A,
    emailB: env.QA_STAGING_EMAIL_B, passB: env.QA_STAGING_PASSWORD_B,
    taskA: env.QA_STAGING_PRIVATE_TASK_A, taskB: env.QA_STAGING_PRIVATE_TASK_B,
    publicA: env.QA_STAGING_PUBLIC_TASK_A,
    attachmentA: env.QA_STAGING_PRIVATE_ATTACHMENT_A || "",
    attachmentB: env.QA_STAGING_PRIVATE_ATTACHMENT_B || ""
  });
}

export function mustSeeOne(result, label, expectedId) {
  if (result.error) throw Error(label + ": owner/public authorized read failed (code " +
    String(result.error.code || result.error.status || "unknown") + ").");
  assert.equal(result.data?.length, 1, label + ": expected one visible fixture row.");
  assert.equal(result.data[0].id, expectedId, label + ": wrong fixture row.");
}

export function mustNotSee(result, label) {
  // Both an RLS empty result and an actual denied grant (401/403/42501) are safe.
  if (result.error) {
    const status = String(result.error.status || result.status || "");
    const code = String(result.error.code || "");
    if ([ "401", "403" ].includes(status) || [ "42501", "PGRST301", "PGRST302" ].includes(code))
      return;
    throw Error(label + ": unexpected API error (code " + (code || status || "unknown") + ").");
  }
  assert.equal(result.data?.length, 0, label + ": private data was readable.");
}

export function validateStoragePath(path, userId, taskId) {
  return path.startsWith(userId + "/" + taskId + "/") &&
    /^[0-9a-f-]{36}\.(pdf|docx|txt|md)$/i.test(path.split("/")[2] || "") &&
    path.split("/").length === 3;
}
