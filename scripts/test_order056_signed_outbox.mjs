// End-to-end simulated approval-outbox -> verified local queue receipt; NO real network.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {selectSandboxApproval,approvalCommandId,dispatchSandboxApprovedOnDemand}=require('./approval_outbox.js');
const {dispatchSandboxTicket}=require('./sandbox_dispatch.js');
const {signTicketEvent,verifyTicketEventIntegrity}=require('./antigravity_watcher.js');
process.env.EVENT_HMAC_SECRET='sandbox_only_test_event_hmac_secret_32_bytes_00001111';
const id='SBX-OUTBOX-056',tenantId='sandbox';
const approval={id:'evt-appr-056',ticketId:id,tenantId,type:'master_approved',actorEmail:'helpus.ecommerce@gmail.com',actorRole:'master_superadmin',authorized:true,progressPercentage:0,status:'in_production',note:'Sandbox authorized only',timestamp:new Date().toISOString(),seq:1,idempotencyKey:'helpus-approval-outbox-v1:'+id+':evt-appr-056'};
approval.signature=signTicketEvent(approval);
const ticket={id,code:id,tenantId,status:'in_production',progressPercentage:0,events:[approval]};
const verify=(e)=>verifyTicketEventIntegrity(e);
const options={allowedTenantIds:[tenantId]};
const selection=selectSandboxApproval([ticket],id,verify,options);
assert.equal(selection.ok,true);
assert.equal(approvalCommandId(selection),approvalCommandId(selection),'idempotent stable command');
for(const bad of [null,[],[{...ticket,status:'resolved'}],[{...ticket,tenantId:'aidoctor'}],[{...ticket,events:[{...approval,note:'tampered'}]}]]) {
  assert.equal(selectSandboxApproval(bad,id,verify,options).ok,false);
}
assert.equal(selectSandboxApproval([ticket],'AID-101',verify,options).ok,false);
assert.equal(selectSandboxApproval([ticket],id,null,options).ok,false);
assert.equal(selectSandboxApproval([{...ticket,events:[approval,{...approval,id:'evt-2'}]}],id,verify,options).ok,false);
let outbound=0;const mockFetch=async(url,request)=>{
  outbound++;
  if(url.endsWith('/health'))return {ok:true,json:async()=>({ok:true,service:'ai-bridge-local'})};
  const sent=JSON.parse(request.body);
  assert.equal(sent.command_id,approvalCommandId(selection));
  assert.equal(sent.payload.approvalJobKey,approval.idempotencyKey);
  return {ok:true,json:async()=>({ok:true,status:'queued',command_id:sent.command_id})};
};
const controls={confirmed:true,env:{HELPUS_ALLOW_LOCAL_SBX_DISPATCH:'1'},allowedTenantIds:[tenantId],fetchTickets:async()=>[ticket],verifyEvent:verify,
 dispatch:(id,params)=>dispatchSandboxTicket(id,{...params,fetch:mockFetch})};
assert.equal((await dispatchSandboxApprovedOnDemand(id,{...controls,confirmed:false})).phase,'prepared_only');
assert.equal(outbound,0);
assert.equal((await dispatchSandboxApprovedOnDemand(id,{...controls,paused:true})).phase,'blocked');
assert.equal(outbound,0);
const success=await dispatchSandboxApprovedOnDemand(id,controls);
assert.equal(success.phase,'queued_only');
assert.equal(success.executionVerified,false);
assert.equal(success.deliveryAcknowledged,false);
assert.equal(outbound,2);
const failure=await dispatchSandboxApprovedOnDemand(id,{...controls,fetchTickets:async()=>[]});
assert.equal(failure.reason,'no_durable_ticket');
assert.equal(outbound,2);
console.log('✅ Ordem 056: outbox assinado + origem duravel + dispatch mock + ACK pendente; zero APIs externas');
