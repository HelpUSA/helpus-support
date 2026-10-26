import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { approveOneSandboxTicket, sandboxApprovalGate, checkSandboxSnapshot,
  SANDBOX_REPO,SANDBOX_PATH } from '../src/lib/sandboxApproval';
import { computeEventPayload, verifyTicketEventIntegrity } from '../src/lib/serverAuth';
const require=createRequire(import.meta.url);
const { selectSandboxApproval, approvalCommandId }=require('./approval_outbox.js');
const env={
  HELPUS_STAGING_APPROVAL_ENABLED:'1',HELPUS_STAGING_ISOLATED_MODE:'1',
  HELPUS_STAGING_DEPLOYMENT:'sandbox',HELPUS_STAGING_APPROVAL_TRANSPORT:'loopback',
  NODE_ENV:'development',VERCEL:'0',
  SESSION_SECRET:'staging_separate_session_secret_test_000000000',
  HELPUS_SANDBOX_DB_REPO:SANDBOX_REPO,
  HELPUS_SANDBOX_DB_PATH:SANDBOX_PATH,HELPUS_SANDBOX_DB_REF:'main',
  HELPUS_STAGING_APPROVAL_TICKET_ID:'SBX-E2E-063',
  HELPUS_STAGING_GITHUB_TOKEN:'synthetic_only_staging_token_00000000000000',
  HELPUS_STAGING_EVENT_HMAC_SECRET:'test_only_isolated_signer_000000000000000',
  VERCEL_ENV:'preview'
};
const key=env.HELPUS_STAGING_EVENT_HMAC_SECRET;
assert.equal(sandboxApprovalGate(env).ok,true);
for(const bad of [
  {...env,HELPUS_STAGING_APPROVAL_ENABLED:'0'},
  {...env,HELPUS_STAGING_ISOLATED_MODE:'0'},
  {...env,HELPUS_STAGING_DEPLOYMENT:'production'},
  {...env,HELPUS_STAGING_APPROVAL_TRANSPORT:'public'},
  {...env,NODE_ENV:'production'},
  {...env,VERCEL:'1'},
  {...env,VERCEL_ENV:''},
  {...env,SESSION_SECRET:''},
  {...env,SESSION_SECRET:key},
  {...env,VERCEL_ENV:'production'},
  {...env,HELPUS_SANDBOX_DB_REPO:'HelpUSA/publicarte'},
  {...env,HELPUS_SANDBOX_DB_PATH:'data/helpus_tickets.json'},
  {...env,HELPUS_STAGING_APPROVAL_TICKET_ID:'AID-101'},
  {...env,HELPUS_STAGING_GITHUB_TOKEN:''},
  {...env,EVENT_HMAC_SECRET:key}
]) assert.equal(sandboxApprovalGate(bad).ok,false);
const ticket={id:'SBX-E2E-063',code:'SBX-E2E-063',tenantId:'sandbox',
  status:'pending_approval',progressPercentage:0,events:[],messages:[],
  createdAt:'2026-10-26T16:45:00.000Z',updatedAt:'2026-10-26T16:45:00.000Z'};
const old=[ticket];
assert.equal(checkSandboxSnapshot(old),true);
assert.equal(approveOneSandboxTicket(old,'AID-101','helpus.ecommerce@gmail.com',key).ok,false);
assert.equal(approveOneSandboxTicket(old,'SBX-E2E-063','client@example.invalid',key).ok,false);
assert.equal(approveOneSandboxTicket([{...ticket,tenantId:'aidoctor'}],'SBX-E2E-063','helpus.ecommerce@gmail.com',key).ok,false);
assert.equal(approveOneSandboxTicket([{...ticket,events:[{id:'fake'}]}],'SBX-E2E-063','helpus.ecommerce@gmail.com',key).ok,false);
const result=approveOneSandboxTicket(old,'SBX-E2E-063','helpus.ecommerce@gmail.com',key);
assert.equal(result.ok,true);
if(!result.ok)throw Error('unreachable');
assert.equal(old[0].status,'pending_approval'); // do not mutate caller
assert.equal(result.tickets[0].status,'in_production');
assert.equal(result.tickets[0].progressPercentage,0);
const e=result.tickets[0].events[0];
assert.equal(e.tenantId,'sandbox');assert.equal(e.authorized,true);
assert.equal(e.idempotencyKey,result.jobKey);
assert.equal(e.signature,createHmac('sha256',key).update(computeEventPayload(e)).digest('hex'));
// The real Windows watcher only recognizes approvals signed by the SAME staging-only key.
const prev=process.env.EVENT_HMAC_SECRET;
process.env.EVENT_HMAC_SECRET=key;
try{
  assert.equal(verifyTicketEventIntegrity(e).valid,true);
  assert.equal(selectSandboxApproval(result.tickets,'SBX-E2E-063',verifyTicketEventIntegrity,
    {allowedTenantIds:['sandbox']}).ok,true);
  const selection=selectSandboxApproval(result.tickets,'SBX-E2E-063',verifyTicketEventIntegrity,
    {allowedTenantIds:['sandbox']});
  assert.ok(approvalCommandId(selection).startsWith('HU-SBX-APPROVED-'));
  assert.equal(verifyTicketEventIntegrity({...e,note:'tampered'}).valid,false);
}finally{
  if(prev===undefined)delete process.env.EVENT_HMAC_SECRET;
  else process.env.EVENT_HMAC_SECRET=prev;
}
assert.equal(approveOneSandboxTicket(result.tickets,'SBX-E2E-063','helpus.ecommerce@gmail.com',key).ok,false);
console.log('✅ Ordem 067: Master gate, isolamento PRIVATE, HMAC alinhado, outbox e reaprovação bloqueada (offline)');
