// Read-only smoke of the deployed QA Hub. Never sends user credentials,
// writes TF records or prints publication content to CI logs.
import assert from 'node:assert/strict';

const site='https://kaina-visualsoftware.github.io/QA-Hub/';
const api='https://pqadmlhcsimlcclpkyov.supabase.co';
const key='sb_publishable_3Duz2dETsyYNPtfY-8Mxjw_pGBvCUP9';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const headers={'apikey':key,'Authorization':'Bearer '+key};

async function waitForDocument(path,fragment){
  let last='';
  for(let attempt=1;attempt<=18;attempt++){
    try{
      const res=await fetch(new URL(path,site),{headers:{'Cache-Control':'no-cache'}});
      const body=await res.text();
      if(res.ok&&body.includes(fragment)){
        console.log('PASS deployed page: '+path);
        return body;
      }
      last='HTTP '+res.status+' or required marker missing';
    }catch(e){last=e instanceof Error?e.message:'Network unavailable';}
    await sleep(10000);
  }
  throw Error('Production page not ready ('+path+'): '+last);
}

const root=await waitForDocument('','./react/');
const react=await waitForDocument('react/','/QA-Hub/react/assets/');
await waitForDocument('react/auth.html','callback-status');
await waitForDocument('qa.html','./react/auth.html');
await waitForDocument('qa-legacy.html','id="auth-form"');
await waitForDocument('public.js',"db.rpc('qa_public_tasks_v1')");
assert.match(root,/react\//);
const asset=react.match(/src="(\/QA-Hub\/react\/assets\/[^"]+\.js)"/)?.[1];
assert.ok(asset,'React entry script was not found');
const script=await fetch(new URL(asset,site));
assert.equal(script.status,200,'Production React JS asset must be served');
console.log('PASS public React JS asset');

const cardsResponse=await fetch(api+'/rest/v1/rpc/qa_public_tasks_v1',{
  method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'
});
assert.equal(cardsResponse.status,200,'Anonymous public list RPC must be callable');
const cards=await cardsResponse.json();
assert.ok(Array.isArray(cards),'Public list RPC must return an array');
const approved=new Set(['id','titulo','codigo','tipo_teste','sistema','versao','executado_em']);
for(const card of cards){
  assert.ok(card&&typeof card==='object','Public projection item invalid');
  for(const field of Object.keys(card))
    assert.ok(approved.has(field),'Unexpected public column: '+field);
}
console.log('PASS limited public RPC projection ('+cards.length+' records)');

const unauthorized=await fetch(api+'/rest/v1/qa_tarefas?select=id&limit=1',{headers});
assert.ok([401,403].includes(unauthorized.status),
  'Anonymous direct operational table SELECT must be denied (got '+unauthorized.status+')');
console.log('PASS anonymous direct table read forbidden');

const privateDetail=await fetch(api+'/rest/v1/rpc/qa_public_task_v1',{
  method:'POST',headers:{...headers,'content-type':'application/json'},
  body:JSON.stringify({p_task_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'})
});
assert.equal(privateDetail.status,200,'Anonymous public detail RPC must be callable');
assert.equal(await privateDetail.json(),null,'Unpublished/nonexistent TF must not appear');
console.log('PASS private/unpublished task inaccessible through RPC');

console.log('Production read-only smoke passed. No Supabase writes.');
