'use strict';
// Ordem 065: consumer PRIVADO, one-shot e somente para SBX.
// O servidor Windows so despacha se houver evento Master assinado E operador habilitar
// explicitamente --send-local + HELPUS_ALLOW_LOCAL_SBX_DISPATCH=1.
// Jamais associa ACK a execucao de codigo ou conclusao; nao escreve no portal.
const {loadStagingTicketsViaGh}=require('./sandbox_gh_probe.js');
const {runSandboxE2EOnce}=require('./sandbox_outbox_journal.js');
const {dispatchSandboxTicket}=require('./sandbox_dispatch.js');
const {probeLocalBridgeCommand}=require('./bridge_ack_probe.js');
const SBX=/^SBX-[A-Z0-9]{1,24}(?:-[A-Z0-9]{1,24}){0,3}$/;
async function oneShotPrivateSandbox(ticketId,options={}) {
  if(typeof ticketId!=='string'||!SBX.test(ticketId))
    return {ok:false,phase:'blocked',reason:'sandbox_ticket_only',networkCalls:0};
  if(options.paused)return {ok:false,phase:'blocked',reason:'worker_paused',networkCalls:0};
  const env=options.env||process.env;
  if(!options.confirmed || !options.sendLocal ||
     env.HELPUS_ALLOW_LOCAL_SBX_DISPATCH!=='1')
    return {ok:true,phase:'prepared_only',networkCalls:0,deliveryAcknowledged:false,
      executionVerified:false};
  if(typeof options.verifyEvent!=='function'||
     typeof options.reserve!=='function'||
     !env.EVENT_HMAC_SECRET || env.EVENT_HMAC_SECRET.length<32)
    return {ok:false,phase:'blocked',reason:'staging_verification_prerequisites_missing',
      networkCalls:0,deliveryAcknowledged:false,executionVerified:false};
  const read=loadStagingTicketsViaGh({
    confirmed:true,paused:false,reserve:options.reserve,runGh:options.runGh
  });
  if(!read.ok)return {ok:false,phase:'blocked',reason:read.reason,
    networkCalls:read.networkCalls,deliveryAcknowledged:false,executionVerified:false};
  // Invalidate ALL remote data not passing HMAC in existing selector. A non-approved
  // staging ticket must never be queued to the Antigravity model.
  const dispatch=options.dispatch||dispatchSandboxTicket;
  const probe=options.probe||probeLocalBridgeCommand;
  const result=await runSandboxE2EOnce(ticketId,{
    confirmed:true,paused:false,env,
    tempDir:options.tempDir,
    fetchTickets:async()=>read.tickets,
    verifyEvent:options.verifyEvent,allowedTenantIds:['sandbox'],
    dispatch,probe
  });
  return {...result,remoteReadCount:read.networkCalls,executionVerified:false};
}
module.exports={oneShotPrivateSandbox};
