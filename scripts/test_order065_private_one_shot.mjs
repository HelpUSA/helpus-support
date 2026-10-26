// Ordem 065: historia NeuroEduardo recuperada SEM restaurar watcher com timers falsos.
// Teste sintético, zero GitHub/Vercel real, zero chamada a LLM.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {oneShotPrivateSandbox}=require('./staging_private_one_shot.js');
const {signTicketEvent,verifyTicketEventIntegrity}=require('./antigravity_watcher.js');
const {readJournal,journalFile}=require('./sandbox_outbox_journal.js');
const {STAGING_ENDPOINT}=require('./sandbox_gh_probe.js');
process.env.EVENT_HMAC_SECRET='offline_order_065_only_local_hmac_000000000000000001';
const ticketId='SBX-E2E-065';
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpus-065-'));
const approval={
 id:'evt-065',ticketId,tenantId:'sandbox',type:'master_approved',
 actorEmail:'synthetic@example.invalid',actorRole:'master_superadmin',authorized:true,
 progressPercentage:0,status:'in_production',timestamp:new Date().toISOString(),
 seq:1,note:'offline simulation only',
 idempotencyKey:'helpus-approval-outbox-v1:'+ticketId+':evt-065'
};
approval.signature=signTicketEvent(approval);
const ticket={id:ticketId,code:ticketId,tenantId:'sandbox',status:'in_production',
 progressPercentage:0,events:[approval]};
let calls=0,reservations=0,dispatched=0,acked=false;
let source=[ticket];
const runGh=(bin,args,options)=>{
 calls++;
 assert.equal(bin,'gh');assert.equal(args[2],STAGING_ENDPOINT);
 assert.equal(options.shell,false);
 return JSON.stringify({encoding:'base64',content:Buffer.from(JSON.stringify(source)).toString('base64')});
};
const reserve=()=>{reservations++;return {allowed:true}};
const gateway={
 dispatch:async(id,{commandId,verifiedApproval})=>{
   dispatched++;assert.equal(id,ticketId);assert.equal(verifiedApproval.approvalEventId,approval.id);
   assert.ok(commandId.includes(ticketId));return {ok:true,phase:'queued_only',commandId};
 },
 probe:async commandId=>({ok:true,commandId,phase:acked?'acked':'queued',
   deliveryAcknowledged:acked,ackedAtPresent:acked,executionVerified:false})
};
const allowed={confirmed:true,sendLocal:true,
 env:{HELPUS_ALLOW_LOCAL_SBX_DISPATCH:'1',EVENT_HMAC_SECRET:process.env.EVENT_HMAC_SECRET},
 paused:false,tempDir,runGh,reserve,verifyEvent:verifyTicketEventIntegrity,...gateway};
try {
  let out=await oneShotPrivateSandbox(ticketId,{...allowed,confirmed:false});
  assert.equal(out.phase,'prepared_only');assert.equal(calls,0);
  out=await oneShotPrivateSandbox(ticketId,{...allowed,sendLocal:false});
  assert.equal(out.phase,'prepared_only');assert.equal(calls,0);
  out=await oneShotPrivateSandbox('AID-101',allowed);
  assert.equal(out.reason,'sandbox_ticket_only');assert.equal(calls,0);
  out=await oneShotPrivateSandbox(ticketId,{...allowed,paused:true});
  assert.equal(out.reason,'worker_paused');assert.equal(calls,0);
  out=await oneShotPrivateSandbox(ticketId,{...allowed,env:{HELPUS_ALLOW_LOCAL_SBX_DISPATCH:'1'}});
  assert.equal(out.reason,'staging_verification_prerequisites_missing');assert.equal(calls,0);
  source=[{...ticket,status:'pending_approval',events:[]}];
  out=await oneShotPrivateSandbox(ticketId,allowed);
  assert.equal(out.ok,false);assert.equal(out.reason,'ticket_not_queued');
  assert.equal(dispatched,0);assert.equal(fs.existsSync(journalFile(tempDir)),false);
  source=[{...ticket,events:[{...approval,note:'tampered'}]}];
  out=await oneShotPrivateSandbox(ticketId,allowed);
  assert.equal(out.ok,false);assert.equal(out.reason,'unverifiable_ticket_history');
  assert.equal(dispatched,0);
  source=[ticket];
  out=await oneShotPrivateSandbox(ticketId,allowed);
  assert.equal(out.ok,true);assert.equal(out.phase,'queued');
  assert.equal(out.remoteReadCount,1);assert.equal(out.executionVerified,false);
  assert.equal(dispatched,1);
  out=await oneShotPrivateSandbox(ticketId,allowed);
  assert.equal(out.newlyDispatched,false);assert.equal(dispatched,1);
  acked=true;
  out=await oneShotPrivateSandbox(ticketId,allowed);
  assert.equal(out.phase,'acked');assert.equal(out.deliveryAcknowledged,true);
  assert.equal(out.executionVerified,false);assert.equal(dispatched,1);
  assert.equal(Object.keys(readJournal(journalFile(tempDir)).jobs).length,1);
  assert.equal(reservations,calls);
  console.log('✅ Ordem 065: staging privado -> HMAC -> journal -> queue/ACK mock sem avanço fictício');
}finally{fs.rmSync(tempDir,{recursive:true,force:true})}
