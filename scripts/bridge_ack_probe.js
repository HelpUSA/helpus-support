'use strict';
// Ordem 058: somente GET loopback. Consulta por command_id ao indice duravel do gateway v0.5.91.
// ACK de transporte NUNCA significa que o chamado foi executado ou resolvido.
const LOCAL_GATEWAY='http://127.0.0.1:8766';
const SANDBOX_COMMAND=/^(?:HU-SUPPORT-LOCAL-SBX-SBX-[A-Z0-9-]+|HU-SBX-APPROVED-SBX-[A-Z0-9-]+-[a-f0-9]{20})$/;
const KNOWN_STATES=new Set([
  'queued','delivering','model_executing','acked','processed','failed','cancelled','dead_letter'
]);
function normalizedState(body,expectedId) {
  // Gateway implementations may return a top-level row or wrap one in command/data.
  const entry=body && typeof body==='object' && !Array.isArray(body)
    ? (body.command && typeof body.command==='object' ? body.command
      : body.data && typeof body.data==='object' ? body.data : body)
    : null;
  if(!entry || entry.command_id!==expectedId || typeof entry.status!=='string')return null;
  const state=entry.status;
  if(!KNOWN_STATES.has(state))return null;
  const ackTimestamp=typeof entry.acked_at==='string'&&entry.acked_at.trim().length>0;
  return {
    phase:state,
    // ACK must be tied to the requested durable command and an actual ack timestamp.
    deliveryAcknowledged:ackTimestamp,
    gatewayMarkedCompleted:entry.is_completed===true,
    createdAtPresent:typeof entry.created_at==='string'&&entry.created_at.length>0,
    deliveredAtPresent:typeof entry.delivered_at==='string'&&entry.delivered_at.length>0,
    ackedAtPresent:ackTimestamp,
    executionVerified:false
  };
}
async function probeLocalBridgeCommand(commandId,options={}) {
  if(commandId!==undefined&&(typeof commandId!=='string'||commandId.length>160||
      !SANDBOX_COMMAND.test(commandId))) {
    return {ok:false,reason:'sandbox_command_id_only',networkCalls:0};
  }
  const gateway=options.gatewayUrl||LOCAL_GATEWAY;
  if(!options.fetch && gateway!==LOCAL_GATEWAY)
    return {ok:false,reason:'non_local_gateway',networkCalls:0};
  const fetchFn=options.fetch||globalThis.fetch;
  let networkCalls=0;
  const get=async endpoint=>{
    networkCalls++;
    const response=await fetchFn(gateway+endpoint,{
      method:'GET',cache:'no-store',redirect:'error',
      signal:AbortSignal.timeout(3500),headers:{Accept:'application/json'}
    });
    if(response.status===404)return {notFound:true};
    if(!response.ok)return {error:true,httpStatus:response.status};
    return {json:await response.json()};
  };
  try {
    const healthRes=await get('/health');
    const health=healthRes.json;
    if(!health||health.ok!==true||health.service!=='ai-bridge-local')
      return {ok:false,reason:'local_gateway_unavailable_or_unverified',networkCalls};
    const stats={
      version:typeof health.version==='string'?health.version:null,
      queued:Number.isSafeInteger(health.commands_queued)?health.commands_queued:null,
      delivering:Number.isSafeInteger(health.commands_delivering)?health.commands_delivering:null
    };
    if(!commandId)return {ok:true,phase:'health_only',stats,networkCalls};
    const ledger=await get('/bridge/r30/status?command_id='+encodeURIComponent(commandId));
    if(ledger.notFound){
      // 404 may mean no record or unsupported endpoint. Never assert historical absence.
      return {ok:true,phase:'not_found_or_endpoint_missing',
        reason:'durable_lookup_returned_404',commandId,stats,networkCalls,
        deliveryAcknowledged:false,executionVerified:false};
    }
    if(ledger.error)return {ok:false,reason:'durable_lookup_http_error',
      httpStatus:ledger.httpStatus,stats,networkCalls,executionVerified:false};
    const parsed=normalizedState(ledger.json,commandId);
    if(!parsed)return {ok:false,reason:'durable_lookup_unrecognized_or_mismatched',
      commandId,stats,networkCalls,deliveryAcknowledged:false,executionVerified:false};
    return {ok:true,commandId,stats,networkCalls,...parsed};
  }catch(_err){
    return {ok:false,reason:'local_gateway_probe_failed',
      deliveryAcknowledged:false,executionVerified:false,networkCalls};
  }
}
module.exports={probeLocalBridgeCommand,normalizedState,KNOWN_STATES};
