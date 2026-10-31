'use strict';
// Ordem 072 — REAL signature verification of the single persisted SBX approval.
// Read-only, explicitly operator-triggered. Never dispatches or alters GitHub state.
// EVENT_HMAC_SECRET must be the unchanged hex TEXT stored by GitHub Actions as
// SBX_APPROVAL_HMAC (do not hex-decode it before use as HMAC input).
const {loadStagingTicketsViaGh}=require('./sandbox_gh_probe.js');
const {selectSandboxApproval,approvalCommandId}=require('./approval_outbox.js');
const TICKET_ID='SBX-E2E-063';
const MASTER_EMAIL='helpus.ecommerce@gmail.com';
function deny(reason,networkCalls=0){
  return {ok:false,phase:'blocked',reason,networkCalls,signatureVerified:false,
    deliveryAcknowledged:false,executionVerified:false};
}
function verifyApprovedSandboxOnce(ticketId,options={}) {
  if(ticketId!==TICKET_ID)return deny('only_registered_staging_ticket_allowed');
  if(options.paused)return deny('worker_paused');
  if(!options.confirmed)return deny('explicit_readonly_confirmation_required');
  const env=options.env||process.env;
  if(!/^[a-f0-9]{64}$/.test(env.EVENT_HMAC_SECRET||''))
    return deny('isolated_staging_event_key_unavailable');
  if(typeof options.reserve!=='function')return deny('manual_read_budget_required');
  if(typeof options.verifyEvent!=='function')return deny('cryptographic_verifier_required');
  const read=loadStagingTicketsViaGh({
    confirmed:true,paused:false,reserve:options.reserve,runGh:options.runGh
  });
  if(!read.ok)return deny(read.reason,read.networkCalls||0);
  const approved=selectSandboxApproval(read.tickets,ticketId,
    event=>{
      if(event&&event.type==='master_approved'&&
        (event.actorRole!=='master_superadmin'||
         (event.actorEmail||'').toLowerCase()!==MASTER_EMAIL))
        return {valid:false,reason:'unexpected_master_identity'};
      return options.verifyEvent(event);
    },{allowedTenantIds:['sandbox']});
  if(!approved.ok)return deny(approved.reason,read.networkCalls);
  const tickets=read.tickets.filter(t=>t.id===ticketId&&t.code===ticketId);
  if(tickets.length!==1||tickets[0].events.length!==1)
    return deny('strict_one_event_staging_required',read.networkCalls);
  const event=tickets[0].events[0];
  if(event.seq!==1||event.actorEmail!==MASTER_EMAIL||
    event.type!=='master_approved'||event.timestamp===undefined)
    return deny('unexpected_sandbox_event',read.networkCalls);
  return {
    ok:true,phase:'signed_approval_verified_readonly',
    ticketId,tenantId:'sandbox',status:tickets[0].status,
    progressPercentage:tickets[0].progressPercentage,
    approvalEventId:approved.approvalEventId,
    jobKey:approved.jobKey,
    commandId:approvalCommandId(approved),
    signatureVerified:true,
    networkCalls:read.networkCalls,
    deliveryAcknowledged:false,
    executionVerified:false,
    productionDeployed:false
  };
}
module.exports={verifyApprovedSandboxOnce};
