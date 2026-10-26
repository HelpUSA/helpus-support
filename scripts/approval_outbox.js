'use strict';
// Ordem 056: sandbox-only reader for a signed durable approval event.
// No tickets are modified, and validation does not imply execution or deploy.
const SBX=/^SBX-[A-Z0-9]{1,24}(?:-[A-Z0-9]{1,24}){0,3}$/;
const KEY_PREFIX='helpus-approval-outbox-v1:';
function selectSandboxApproval(tickets, ticketId, verifyEvent, options={}) {
  if (!SBX.test(ticketId||'')) return {ok:false,reason:'sandbox_ticket_only'};
  if (!Array.isArray(tickets)) return {ok:false,reason:'shared_store_unavailable'};
  if (typeof verifyEvent!=='function') return {ok:false,reason:'missing_signature_verifier'};
  const matches=tickets.filter(t=>t&&(t.id===ticketId||t.code===ticketId));
  if (matches.length!==1) return {ok:false,reason:matches.length?'ambiguous_ticket':'no_durable_ticket'};
  const ticket=matches[0];
  if (ticket.id!==ticketId || ticket.code!==ticketId) return {ok:false,reason:'ticket_identity_mismatch'};
  if (!ticket.tenantId || !Array.isArray(options.allowedTenantIds) ||
      !options.allowedTenantIds.includes(ticket.tenantId)) return {ok:false,reason:'tenant_not_allowed'};
  if (ticket.status!=='in_production' || Number(ticket.progressPercentage||0)!==0) {
    return {ok:false,reason:'ticket_not_queued'};
  }
  if (!Array.isArray(ticket.events) || ticket.events.length===0) return {ok:false,reason:'missing_approval_history'};
  // Any corrupt lifecycle event means ambiguity, so do not silently accept it.
  for(const event of ticket.events) {
    const checked=verifyEvent(event);
    if(!checked || !checked.valid) return {ok:false,reason:'unverifiable_ticket_history'};
  }
  const approvals=ticket.events.filter(e=>e.type==='master_approved'&&
    e.authorized===true && e.actorRole==='master_superadmin' &&
    e.ticketId===ticket.id && e.tenantId===ticket.tenantId &&
    e.status==='in_production' && e.progressPercentage===0 &&
    e.idempotencyKey===KEY_PREFIX+ticket.id+':'+e.id);
  if(approvals.length!==1) return {ok:false,reason:'missing_or_ambiguous_signed_approval'};
  const approval=approvals[0];
  // Do not resurrect an approval superseded by reset, resolution, cancellation or progress.
  const last=ticket.events.at(-1);
  if(last!==approval) return {ok:false,reason:'approval_superseded'};
  if(!approval.signature || !/^[a-f0-9]{64}$/i.test(approval.signature))
    return {ok:false,reason:'missing_signature'};
  return {ok:true,ticketId:ticket.id,tenantId:ticket.tenantId,
    jobKey:approval.idempotencyKey,approvalEventId:approval.id,
    approvalSignature:approval.signature,executionAcknowledged:false};
}
function approvalCommandId(selected) {
  if (!selected || !selected.ok || !SBX.test(selected.ticketId||'')) throw Error('no_verified_sandbox_approval');
  // Event identity and idempotency bound by validated signed jobKey; repeat sends collide at gateway.
  return 'HU-SBX-APPROVED-'+selected.ticketId+'-'+selected.approvalSignature.slice(0,20);
}
async function dispatchSandboxApprovedOnDemand(ticketId, options={}) {
  const {confirmed=false,paused=false,env=process.env,fetchTickets,verifyEvent,dispatch}=options;
  if(!SBX.test(ticketId||''))return {ok:false,phase:'blocked',reason:'sandbox_ticket_only'};
  if(paused)return {ok:false,phase:'blocked',reason:'worker_paused'};
  if(!confirmed || env.HELPUS_ALLOW_LOCAL_SBX_DISPATCH!=='1')
    return {ok:true,phase:'prepared_only',networkCalls:0,executionVerified:false};
  if(typeof fetchTickets!=='function'||typeof verifyEvent!=='function'||typeof dispatch!=='function')
    return {ok:false,phase:'blocked',reason:'missing_verified_transport'};
  const tickets=await fetchTickets();
  const selected=selectSandboxApproval(tickets,ticketId,verifyEvent,{allowedTenantIds:options.allowedTenantIds});
  if(!selected.ok)return {ok:false,phase:'blocked',reason:selected.reason};
  return dispatch(ticketId,{...options,commandId:approvalCommandId(selected),verifiedApproval:selected});
}
module.exports={selectSandboxApproval,approvalCommandId,dispatchSandboxApprovedOnDemand};
