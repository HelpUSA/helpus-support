// Ordem 053: testes offline determinísticos, nenhuma chamada ao gateway real ou GitHub.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {buildSandboxEnvelope,dispatchSandboxTicket}=require('./sandbox_dispatch.js');
const {approvalCommandId}=require('./approval_outbox.js');
const id='SBX-DEMO-001';
for(const bad of ['AID-101','BRA-115','SBX-../AID-101','SBX-', 'sbx-demo-001']) {
  assert.throws(()=>buildSandboxEnvelope(bad),/sandbox_ticket_id_required/);
}
const verifiedApproval={ok:true,ticketId:id,tenantId:'sandbox',
  approvalEventId:'evt-a1',approvalSignature:'e'.repeat(64),
  jobKey:'helpus-approval-outbox-v1:'+id+':evt-a1'};
const verifiedCommand=approvalCommandId(verifiedApproval);
const approvedOpts={commandId:verifiedCommand,verifiedApproval};
const envelope=buildSandboxEnvelope(id);
assert.equal(envelope.command_id,'HU-SUPPORT-LOCAL-SBX-'+id);
assert.equal(envelope.action,'send-chat-message');
assert.equal(envelope.payload.allowAutonomousDeploy,false);
let calls=[];
const fetchMock=async(url,options)=>{
  calls.push({url,method:options.method});
  if(url.endsWith('/health')) return {ok:true,status:200,json:async()=>({ok:true,service:'ai-bridge-local'})};
  if(url.endsWith('/bridge/commands')) {
    const payload=JSON.parse(options.body);
    assert.equal(payload.command_id,verifiedCommand);
    assert.equal(payload.payload.approvalEventId,verifiedApproval.approvalEventId);
    assert.equal(payload.payload.sandbox,true);
    return {ok:true,status:200,json:async()=>({ok:true,command_id:payload.command_id,status:'queued'})};
  }
  throw new Error('unexpected request');
};
const env={HELPUS_ALLOW_LOCAL_SBX_DISPATCH:'1'};
let res=await dispatchSandboxTicket(id,{env,fetch:fetchMock});
assert.equal(res.phase,'prepared_only');assert.equal(calls.length,0);
res=await dispatchSandboxTicket(id,{env,confirmed:true,paused:true,fetch:fetchMock});
assert.equal(res.phase,'blocked');assert.equal(calls.length,0);
res=await dispatchSandboxTicket(id,{env:{},confirmed:true,fetch:fetchMock});
assert.equal(res.phase,'prepared_only');assert.equal(calls.length,0);
res=await dispatchSandboxTicket(id,{env,confirmed:true,fetch:fetchMock});
assert.equal(res.phase,'blocked');assert.equal(res.reason,'signed_outbox_selection_required');
assert.equal(calls.length,0);
res=await dispatchSandboxTicket(id,{env,confirmed:true,
  commandId:verifiedCommand,verifiedApproval:{...verifiedApproval,ticketId:'AID-101'},fetch:fetchMock});
assert.equal(res.phase,'blocked');assert.equal(calls.length,0);
res=await dispatchSandboxTicket(id,{env,confirmed:true,
  commandId:'BAD',verifiedApproval,fetch:fetchMock});
assert.equal(res.phase,'blocked');assert.equal(calls.length,0);
res=await dispatchSandboxTicket(id,{env,confirmed:true,...approvedOpts,fetch:fetchMock});
assert.equal(res.phase,'queued_only');
assert.equal(res.deliveryAcknowledged,false);
assert.equal(res.executionVerified,false);
assert.deepEqual(calls.map(x=>x.method),['GET','POST']);
calls=[];
res=await dispatchSandboxTicket(id,{env,confirmed:true,...approvedOpts,fetch:async(url,o)=>{
  calls.push(url);
  if(url.endsWith('/health'))return {ok:true,status:200,json:async()=>({ok:true,service:'ai-bridge-local'})};
  return {ok:false,status:409};
}});
assert.equal(res.phase,'duplicate');assert.equal(calls.length,2);
calls=[];
res=await dispatchSandboxTicket(id,{env,confirmed:true,...approvedOpts,fetch:async(url,o)=>{
  calls.push(url);
  if(url.endsWith('/health'))return {ok:true,status:200,json:async()=>({ok:true,service:'ai-bridge-local'})};
  throw new Error('connection lost after potential acceptance');
}});
assert.equal(res.phase,'uncertain_delivery');assert.equal(calls.length,2);
console.log('✅ Ordem 073: despacho sem aprovação verificada bloqueado; conflito e queda simulados offline');
