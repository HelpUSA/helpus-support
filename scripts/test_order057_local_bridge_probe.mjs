// Ordem 058: regressão de GET durável por command_id; exclusivamente HTTP local simulado.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {probeLocalBridgeCommand}=require('./bridge_ack_probe.js');
const cmd='HU-SUPPORT-LOCAL-SBX-SBX-DEMO-001';
let phase='queued',exists=true,mismatch=false,visits=[];
const server=createServer((req,res)=>{
  visits.push([req.method,req.url]);
  res.setHeader('Content-Type','application/json');
  if(req.url==='/health'){
    res.end(JSON.stringify({ok:true,service:'ai-bridge-local',version:'0.5.91',
      commands_queued:1,commands_delivering:0}));return;
  }
  if(req.url==='/bridge/r30/status?command_id='+encodeURIComponent(cmd)||
      req.url?.startsWith('/bridge/r30/status?command_id=')){
    if(!exists){res.statusCode=404;res.end(JSON.stringify({ok:false,error:'not_found'}));return;}
    res.end(JSON.stringify({ok:true,command_id:mismatch?'HU-UNRELATED':cmd,
      status:phase,created_at:'2026-10-26T00:00:00Z',
      delivered_at:phase==='queued'?null:'2026-10-26T00:01:00Z',
      acked_at:['acked','processed','failed'].includes(phase)?'2026-10-26T00:02:00Z':null,
      is_completed:phase==='processed'}));return;
  }
  res.statusCode=404;res.end(JSON.stringify({ok:false,error:'unexpected_route'}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const gatewayUrl='http://127.0.0.1:'+server.address().port;
const mockedFetch=(...args)=>fetch(...args);
try{
  let r=await probeLocalBridgeCommand(undefined,{gatewayUrl,fetch:mockedFetch});
  assert.equal(r.phase,'health_only');assert.equal(r.networkCalls,1);
  for(const state of ['queued','delivering','model_executing','acked','processed','failed']){
    phase=state;
    r=await probeLocalBridgeCommand(cmd,{gatewayUrl,fetch:mockedFetch});
    assert.equal(r.ok,true);assert.equal(r.phase,state);assert.equal(r.networkCalls,2);
    assert.equal(r.deliveryAcknowledged,['acked','processed','failed'].includes(state));
    assert.equal(r.gatewayMarkedCompleted,state==='processed');
    assert.equal(r.executionVerified,false);
  }
  mismatch=true;
  r=await probeLocalBridgeCommand(cmd,{gatewayUrl,fetch:mockedFetch});
  assert.equal(r.ok,false);assert.equal(r.reason,'durable_lookup_unrecognized_or_mismatched');
  mismatch=false;exists=false;
  r=await probeLocalBridgeCommand(cmd,{gatewayUrl,fetch:mockedFetch});
  assert.equal(r.phase,'not_found_or_endpoint_missing');
  assert.equal(r.deliveryAcknowledged,false);
  const n=visits.length;
  r=await probeLocalBridgeCommand('HU-SUPPORT-LOCAL-SBX-AID-101',{gatewayUrl,fetch:mockedFetch});
  assert.equal(r.reason,'sandbox_command_id_only');assert.equal(r.networkCalls,0);
  assert.equal(visits.length,n);
  assert.ok(visits.every(([method,url])=>method==='GET' &&
    (url==='/health'||url.startsWith('/bridge/r30/status?command_id='))));
  console.log('✅ Ordem 058: indice duravel, model_executing, ACK e fail-closed testados em loopback simulado');
}finally{
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}
