'use strict';
// Ordem 053: dispatch LOCAL e pontual, somente de um ticket fictício SBX.
// O transporte aceito na fila NÃO constitui aprovação Master nem execução comprovada.
const LOCAL_GATEWAY='http://127.0.0.1:8766';
const ANTIGRAVITY_CHAT_ID='40551abb-752d-42c8-b2d8-4b943d61a316';
const SBX_PATTERN=/^SBX-[A-Z0-9]{1,24}(?:-[A-Z0-9]{1,24}){0,3}$/;

function buildSandboxEnvelope(ticketId) {
  if (typeof ticketId!=='string' || !SBX_PATTERN.test(ticketId)) {
    throw new Error('sandbox_ticket_id_required');
  }
  return {
    schema:'ai_bridge_local.envelope',
    schema_version:1,
    command_id:'HU-SUPPORT-LOCAL-SBX-'+ticketId,
    action:'send-chat-message',
    delivery_kind:'inter_agent_message',
    source_chat_id:'helpus-support-sandbox-local',
    target_chat_id:ANTIGRAVITY_CHAT_ID,
    from_agent:'helpus-support-sandbox',
    to_agent:'antigravity',
    message:'[SBX TRANSPORT PROBE - SEM EXECUCAO] Ticket ficticio '+ticketId+
      '. Confirmar APENAS recebimento da mensagem. Nenhum chamado real foi aprovado. Nao executar codigo, nao fazer deploy, nao editar arquivos e nao acessar APIs externas.',
    payload:{
      text:'SBX transport probe '+ticketId+'; receipt only; no work or deploy.',
      correlation_id:'HU-SUPPORT-LOCAL-SBX-'+ticketId,
      sandbox:true,
      requires_ack:true,
      allowAutonomousDeploy:false
    }
  };
}

async function dispatchSandboxTicket(ticketId, opts={}) {
  const envelope=buildSandboxEnvelope(ticketId);
  // Zero I/O by default. A posting to the real bridge may invoke a model and incur quota.
  if (opts.paused) return {ok:false,phase:'blocked',reason:'worker_paused',networkCalls:0};
  const env=opts.env||process.env;
  if (!opts.confirmed || env.HELPUS_ALLOW_LOCAL_SBX_DISPATCH!=='1') {
    return {ok:true,phase:'prepared_only',networkCalls:0,commandId:envelope.command_id,
      message:'Simulacao local: nenhuma mensagem entregue; execute somente apos autorizacao especifica.'};
  }
  const fetchFn=opts.fetch||globalThis.fetch;
  const gateway=opts.gatewayUrl||LOCAL_GATEWAY;
  // Test injection supports mocked URLs; production only permits exact IPv4 loopback.
  if (!opts.fetch && gateway!==LOCAL_GATEWAY) {
    return {ok:false,phase:'blocked',reason:'non_local_gateway',networkCalls:0};
  }
  let networkCalls=0;
  try {
    networkCalls++;
    const health=await fetchFn(gateway+'/health',{method:'GET',signal:AbortSignal.timeout(3000)});
    if (!health.ok) return {ok:false,phase:'gateway_unavailable',httpStatus:health.status,networkCalls};
    const info=await health.json();
    if (!info.ok || info.service!=='ai-bridge-local') {
      return {ok:false,phase:'gateway_unverified',networkCalls};
    }
    networkCalls++;
    const response=await fetchFn(gateway+'/bridge/commands',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(envelope),
      signal:AbortSignal.timeout(5000)
    });
    if (response.status===409) {
      return {ok:false,phase:'duplicate',reason:'existing_command_id',commandId:envelope.command_id,networkCalls};
    }
    if (!response.ok) {
      return {ok:false,phase:'rejected',httpStatus:response.status,networkCalls};
    }
    const receipt=await response.json();
    if (receipt.ok!==true || receipt.command_id!==envelope.command_id || receipt.status!=='queued') {
      return {ok:false,phase:'unverified_receipt',networkCalls};
    }
    return {ok:true,phase:'queued_only',commandId:envelope.command_id,networkCalls,
      deliveryAcknowledged:false,executionVerified:false};
  } catch (_error) {
    // Never retry automatically: network failure may follow successful acceptance.
    return {ok:false,phase:'uncertain_delivery',reason:'manual_queue_inspection_required',networkCalls};
  }
}

module.exports={buildSandboxEnvelope,dispatchSandboxTicket,SBX_PATTERN};
