import test from "node:test";
import assert from "node:assert/strict";
import {AI_ROLLOUT_FEATURES,rolloutBucket,aiFeatureEnabled,disabledAiResponse}
 from "../supabase/functions/_shared/ai-feature-flags.mjs";
const user="123e4567-e89b-42d3-a456-426614174000";
const env=map=>name=>map[name];
test("F8 default rollout preserves all current F7 features",()=>{
 for(const feature of Object.keys(AI_ROLLOUT_FEATURES))
  assert.equal(aiFeatureEnabled(feature,user,env({})),true);
});
test("F8 master kill-switch denies all known model paths",()=>{
 for(const feature of Object.keys(AI_ROLLOUT_FEATURES)){
  assert.equal(aiFeatureEnabled(feature,user,env({QA_AI_F8_ENABLED:"false"})),false);
  assert.equal(aiFeatureEnabled(feature,user,env({QA_AI_F8_ENABLED:"off"})),false);
 }
 assert.equal(disabledAiResponse().error,"feature_disabled");
});
test("F8 per-feature 0/100 and malformed values fail closed",()=>{
 for(const [feature,name] of Object.entries(AI_ROLLOUT_FEATURES)){
  assert.equal(aiFeatureEnabled(feature,user,env({[name]:"0"})),false);
  assert.equal(aiFeatureEnabled(feature,user,env({[name]:"100"})),true);
  assert.equal(aiFeatureEnabled(feature,user,env({[name]:"101"})),false);
  assert.equal(aiFeatureEnabled(feature,user,env({[name]:"-1"})),false);
  assert.equal(aiFeatureEnabled(feature,user,env({[name]:"not_a_number"})),false);
 }
});
test("F8 cohort selection is deterministic and never confuses different feature keys",()=>{
 for(const name of Object.keys(AI_ROLLOUT_FEATURES)){
  assert.equal(rolloutBucket(user,name),rolloutBucket(user,name));
  const bucket=rolloutBucket(user,name);
  assert.ok(bucket>=0&&bucket<100);
  const featureValue=String(bucket);
  assert.equal(aiFeatureEnabled(name,user,env({[AI_ROLLOUT_FEATURES[name]]:featureValue})),false);
  assert.equal(aiFeatureEnabled(name,user,env({[AI_ROLLOUT_FEATURES[name]]:String(bucket+1)})),true);
 }
 assert.equal(aiFeatureEnabled("unknown",user,env({})),false);
 assert.equal(aiFeatureEnabled("general","attacker",env({})),false);
});
