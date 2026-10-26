'use strict';
// Ordem 057: verificacao somente-leitura do gateway local.
// NUNCA envia tarefas, NUNCA consulta GitHub e NUNCA afirma conclusao a partir de status de fila.
const LOCAL_GATEWAY = 'http://127.0.0.1:8766';
const SANDBOX_COMMAND = /^(?:HU-SUPPORT-LOCAL-SBX-SBX-[A-Z0-9-]+|HU-SBX-APPROVED-SBX-[A-Z0-9-]+-[a-f0-9]{20})$/;
const KNOWN_STATES = new Set(['queued','delivering','acked','processed','failed','cancelled','dead_letter']);

async function probeLocalBridgeCommand(commandId, options={}) {
  if (commandId !== undefined && (typeof commandId !== 'string' ||
      commandId.length > 160 || !SANDBOX_COMMAND.test(commandId))) {
    return {ok:false,reason:'sandbox_command_id_only',networkCalls:0};
  }
  const gateway=options.gatewayUrl || LOCAL_GATEWAY;
  // No production network routing beyond literal IPv4 loopback; tests can inject a fetch.
  if (!options.fetch && gateway !== LOCAL_GATEWAY) {
    return {ok:false,reason:'non_local_gateway',networkCalls:0};
  }
  const fetchFn=options.fetch || globalThis.fetch;
  let networkCalls=0;
  const readJson=async endpoint=>{
    networkCalls++;
    const res=await fetchFn(gateway+endpoint,{
      method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3500),
      headers:{'Accept':'application/json'}
    });
    if (!res.ok) return null;
    return res.json();
  };
  try {
    const health=await readJson('/health');
    if (!health || health.ok!==true || health.service!=='ai-bridge-local') {
      return {ok:false,reason:'local_gateway_unavailable_or_unverified',networkCalls};
    }
    const stats={
      version:typeof health.version==='string'?health.version:null,
      queued:Number.isSafeInteger(health.commands_queued)?health.commands_queued:null,
      delivering:Number.isSafeInteger(health.commands_delivering)?health.commands_delivering:null,
    };
    if (!commandId) return {ok:true,phase:'health_only',stats,networkCalls};
    const control=await readJson('/control/status');
    if (!control || !Array.isArray(control.recent_commands)) {
      return {ok:false,reason:'ledger_unavailable_or_unrecognized',stats,networkCalls,
        deliveryAcknowledged:false,executionVerified:false};
    }
    const matches=control.recent_commands.filter(row=>row && row.command_id===commandId);
    if (matches.length!==1) {
      return {ok:true,phase:'not_observed',reason:'recent_ledger_is_not_complete_history',stats,
        deliveryAcknowledged:false,executionVerified:false,networkCalls};
    }
    const state=matches[0].status;
    if (!KNOWN_STATES.has(state)) {
      return {ok:false,reason:'unrecognized_command_state',stats,networkCalls};
    }
    return {ok:true,phase:state,commandId,stats,
      deliveryAcknowledged:state==='acked'||state==='processed',
      executionVerified:false, // A queue acknowledgement is never evidence of work completion.
      networkCalls};
  } catch (_err) {
    return {ok:false,reason:'local_gateway_probe_failed',deliveryAcknowledged:false,
      executionVerified:false,networkCalls};
  }
}
module.exports={probeLocalBridgeCommand};
