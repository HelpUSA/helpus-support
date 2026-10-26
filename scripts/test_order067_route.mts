// Ordem 067 — rota real em memoria. NENHUMA requisicao externa de GitHub.
import assert from 'node:assert/strict';
import { signSessionToken } from '../src/lib/serverAuth';
import { POST } from '../src/app/api/sandbox/tickets/[id]/approve/route';
const env={
  SESSION_SECRET:'staging_test_session_secret_000000000000000000',
  HELPUS_STAGING_APPROVAL_ENABLED:'1',
  HELPUS_STAGING_ISOLATED_MODE:'1',
  HELPUS_STAGING_DEPLOYMENT:'sandbox',
  HELPUS_SANDBOX_DB_REPO:'HelpUSA/helpus-support-sandbox',
  HELPUS_SANDBOX_DB_PATH:'data/support_sbx_tickets.json',
  HELPUS_SANDBOX_DB_REF:'main',
  HELPUS_STAGING_APPROVAL_TICKET_ID:'SBX-E2E-063',
  HELPUS_STAGING_GITHUB_TOKEN:'synthetic_staging_repo_token_only_001',
  HELPUS_STAGING_EVENT_HMAC_SECRET:'isolated_staging_event_secret_test_0000000001',
  VERCEL_ENV:'preview'
};
const oldEnv={};
for(const [k,v] of Object.entries(env)){oldEnv[k]=process.env[k];process.env[k]=v;}
const base=[{id:'SBX-E2E-063',code:'SBX-E2E-063',tenantId:'sandbox',
  status:'pending_approval',progressPercentage:0,events:[],messages:[]}];
let tickets=structuredClone(base),sha='a'.repeat(40);
let calls=0,reads=0,writes=0,rejectPut=false;
const realFetch=globalThis.fetch;
globalThis.fetch=(async (url,options)=>{
  calls++;
  assert.ok(String(url).startsWith('https://api.github.com/repos/HelpUSA/helpus-support-sandbox/contents/data/support_sbx_tickets.json'));
  assert.ok(options.headers.Authorization.startsWith('Bearer synthetic_staging_repo_token_only_001'));
  if(options.method==='GET'){
    reads++;
    return Response.json({encoding:'base64',sha,path:'data/support_sbx_tickets.json',
      content:Buffer.from(JSON.stringify(tickets)).toString('base64')});
  }
  if(options.method==='PUT'){
    writes++;
    if(rejectPut)return Response.json({message:'conflict'},{status:409});
    const body=JSON.parse(options.body);
    assert.equal(body.sha,sha);
    assert.equal(body.branch,'main');
    const next=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
    assert.equal(next.length,1);
    assert.equal(next[0].status,'in_production');
    assert.equal(next[0].events.length,1);
    tickets=next;
    sha='b'.repeat(40);
    return Response.json({commit:{sha},content:{path:'data/support_sbx_tickets.json'}});
  }
  throw Error('Unexpected network operation');
}) as typeof fetch;
const token=signSessionToken({email:'helpus.ecommerce@gmail.com',role:'super_admin',
  tenantId:'all',allowedTenantIds:['all']},120);
const request=(headers={})=>new Request('http://localhost/api/sandbox/tickets/SBX-E2E-063/approve',{
  method:'POST',headers
}) as any;
const call=(req:any,id='SBX-E2E-063')=>POST(req,{params:Promise.resolve({id})});
try {
  let response=await call(request());
  assert.equal(response.status,401);assert.equal(calls,0);
  response=await call(request({'authorization':'Bearer invalid'}));
  assert.equal(response.status,403);assert.equal(calls,0);
  response=await call(request({'authorization':'Bearer '+token,'x-superadmin-secret':'anything'}));
  assert.equal(response.status,403);assert.equal(calls,0);
  response=await call(request({'authorization':'Bearer '+token}),'AID-101');
  assert.equal(response.status,404);assert.equal(calls,0);
  process.env.VERCEL_ENV='production';
  response=await call(request({'authorization':'Bearer '+token}));
  assert.equal(response.status,503);assert.equal(calls,0);
  process.env.VERCEL_ENV='preview';
  rejectPut=true;
  response=await call(request({'authorization':'Bearer '+token}));
  assert.equal(response.status,409);assert.equal(reads,1);assert.equal(writes,1);
  assert.equal(tickets[0].status,'pending_approval');
  rejectPut=false;
  response=await call(request({'authorization':'Bearer '+token}));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.success,true);
  assert.equal(data.executionDispatched,false);
  assert.equal(data.executionVerified,false);
  assert.equal(data.status,'in_production');
  assert.equal(tickets[0].events[0].idempotencyKey,data.jobKey);
  response=await call(request({'authorization':'Bearer '+token}));
  assert.equal(response.status,409);
  assert.equal(writes,2,'No duplicate approval writes');
  console.log('✅ Ordem 067: API auth, branch isolada, CAS 409, gravação única, sem dispatch (offline)');
}finally{
  globalThis.fetch=realFetch;
  for(const [k,v] of Object.entries(oldEnv))
    if(v===undefined)delete process.env[k];else process.env[k]=v as string;
}
