// Ordem 072: verify a GitHub-authenticated sandbox approval and reject wrong
// HMAC/actor/tenant without writing or dispatching anything (all mocked).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {verifyApprovedSandboxOnce}=require('./staging_signed_approval_probe.js');
const {signTicketEvent,verifyTicketEventIntegrity}=require('./antigravity_watcher.js');
const {STAGING_ENDPOINT}=require('./sandbox_gh_probe.js');
const key='0'.repeat(64);
process.env.EVENT_HMAC_SECRET=key;
const id='SBX-E2E-063';
const event={
 id:'evt-appr-072',ticketId:id,tenantId:'sandbox',type:'master_approved',
 actorEmail:'helpus.ecommerce@gmail.com',actorRole:'master_superadmin',
 authorized:true,progressPercentage:0,status:'in_production',
 note:'Single synthetic approval; no model invocation',timestamp:new Date().toISOString(),
 seq:1,idempotencyKey:'helpus-approval-outbox-v1:'+id+':evt-appr-072'
};
event.signature=signTicketEvent(event);
const ticket={id,code:id,tenantId:'sandbox',status:'in_production',progressPercentage:0,events:[event]};
let stored=[ticket], ghCalls=0, quotas=0;
const runGh=(bin,args)=>{
 ghCalls++;
 assert.equal(bin,'gh');
 assert.deepEqual(args,['api','-X','GET',STAGING_ENDPOINT,
   '-H','Accept: application/vnd.github+json']);
 return JSON.stringify({encoding:'base64',content:Buffer.from(JSON.stringify(stored)).toString('base64')});
};
const reserve=kind=>{quotas++;assert.equal(kind,'manual');return {allowed:true}};
const opts={confirmed:true,env:{EVENT_HMAC_SECRET:key},verifyEvent:verifyTicketEventIntegrity,
  runGh,reserve,paused:false};
let result=verifyApprovedSandboxOnce(id,{...opts,confirmed:false});
assert.equal(result.reason,'explicit_readonly_confirmation_required');
result=verifyApprovedSandboxOnce('AID-101',opts);
assert.equal(result.reason,'only_registered_staging_ticket_allowed');
result=verifyApprovedSandboxOnce(id,{...opts,env:{EVENT_HMAC_SECRET:''}});
assert.equal(result.reason,'isolated_staging_event_key_unavailable');
result=verifyApprovedSandboxOnce(id,{...opts,paused:true});
assert.equal(result.reason,'worker_paused');
result=verifyApprovedSandboxOnce(id,{...opts,reserve:()=>({allowed:false})});
assert.equal(result.reason,'external_request_budget_blocked');
assert.equal(ghCalls,0);assert.equal(quotas,0);
result=verifyApprovedSandboxOnce(id,opts);
assert.equal(result.ok,true);
assert.equal(result.phase,'signed_approval_verified_readonly');
assert.equal(result.signatureVerified,true);
assert.equal(result.commandId.startsWith('HU-SBX-APPROVED-SBX-E2E-063-'),true);
assert.equal(result.networkCalls,1);assert.equal(result.executionVerified,false);
assert.equal(result.deliveryAcknowledged,false);
assert.equal(ghCalls,1);assert.equal(quotas,1);
stored=[{...ticket,events:[{...event,note:'tampered'}]}];
result=verifyApprovedSandboxOnce(id,opts);
assert.equal(result.reason,'unverifiable_ticket_history');
stored=[{...ticket,events:[{...event,actorEmail:'other@example.invalid'}]}];
result=verifyApprovedSandboxOnce(id,opts);
assert.equal(result.reason,'unverifiable_ticket_history');
stored=[{...ticket,events:[event,{...event,id:'duplicate'}]}];
result=verifyApprovedSandboxOnce(id,opts);
assert.equal(result.ok,false);
stored=[{...ticket,tenantId:'aidoctor'}];
result=verifyApprovedSandboxOnce(id,opts);
assert.equal(result.reason,'staging_contains_non_sandbox_data');
console.log('✅ Ordem 072: verified signed SBX GitHub approval, one read, zero POST/dispatch');
