import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTION_PROJECT_REF, validateStagingConfig,
  mustSeeOne, mustNotSee, validateStoragePath
} from "../scripts/staging-rls-guards.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const REF = "abcdefghijabcdefghij";
function env(overrides = {}) {
  return {
    QA_STAGING_CONFIRM: "READ_ONLY_STAGING",
    QA_STAGING_URL: "https://" + REF + ".supabase.co",
    QA_STAGING_EXPECTED_REF: REF,
    QA_STAGING_PUBLISHABLE_KEY: "sb_publishable_testfixture",
    QA_STAGING_EMAIL_A: "a@fixture.invalid", QA_STAGING_PASSWORD_A: "dummy",
    QA_STAGING_EMAIL_B: "b@fixture.invalid", QA_STAGING_PASSWORD_B: "dummy",
    QA_STAGING_PRIVATE_TASK_A: A, QA_STAGING_PRIVATE_TASK_B: B,
    QA_STAGING_PUBLIC_TASK_A: C, ...overrides
  };
}

test("rejects any production project even with an explicit confirmation", () => {
  assert.throws(() => validateStagingConfig(env({
    QA_STAGING_URL: "https://" + PRODUCTION_PROJECT_REF + ".supabase.co",
    QA_STAGING_EXPECTED_REF: PRODUCTION_PROJECT_REF
  })), /Production Supabase/);
});
test("requires confirmation, expected project and complete fixtures", () => {
  assert.throws(() => validateStagingConfig(env({ QA_STAGING_CONFIRM: "" })), /confirmation/);
  assert.throws(() => validateStagingConfig(env({ QA_STAGING_EXPECTED_REF: "zzzzzzzzzzzzzzzzzzzz" })),
    /differs/);
  assert.throws(() => validateStagingConfig(env({ QA_STAGING_PASSWORD_A: "" })), /missing/);
  assert.throws(() => validateStagingConfig(env({ QA_STAGING_PRIVATE_TASK_B: A })),
    /distinct/);
  assert.throws(() => validateStagingConfig(env({ QA_STAGING_EMAIL_B: "A@fixture.invalid" })),
    /different/);
  assert.throws(() => validateStagingConfig(env({ QA_STAGING_URL: "http://example.invalid" })),
    /direct HTTPS/);
});
test("rejects privileged keys without printing their contents", () => {
  assert.throws(() => validateStagingConfig(env({
    QA_STAGING_PUBLISHABLE_KEY: "sb_secret_never_log"
  })), /Only publishable/);
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  assert.throws(() => validateStagingConfig(env({
    QA_STAGING_PUBLISHABLE_KEY: "header." + payload + ".sig"
  })), /Only publishable/);
  assert.equal(validateStagingConfig(env()).projectRef, REF);
});
test("separates visible, denied, and misconfigured fixture reads", () => {
  mustSeeOne({ data: [{ id: A }], error: null }, "owner", A);
  mustNotSee({ data: [], error: null }, "guest");
  mustNotSee({ data: null, error: { code: "42501" } }, "guest-no-grant");
  assert.throws(() => mustNotSee({ data: [{ id: A }], error: null }, "cross-account"),
    /private data was readable/);
  assert.throws(() => mustSeeOne({ data: [], error: null }, "owner", A), /fixture row/);
  assert.throws(() => mustNotSee({ data: null, error: { code: "42703" } }, "table"),
    /unexpected API error/);
});
test("requires a private Storage path under its actual owner/task", () => {
  const path = A + "/" + B + "/" + C + ".txt";
  assert.equal(validateStoragePath(path, A, B), true);
  assert.equal(validateStoragePath(path, B, A), false);
  assert.equal(validateStoragePath("outside/" + path, A, B), false);
});
