// Ordem 057: HTTP real apenas em servidor efemero local, sem IA/Cloudflare/GitHub.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {probeLocalBridgeCommand}=require('./bridge_ack_probe.js');
const cmd='HU-SUPPORT-LOCAL-SBX-SBX-DEMO-001';
let phase='queued',visits=[];
const server=createServer((req,res)=>{
  visits.push([req.method,req.url]);
  const body=req.url==='/health'
    ? {ok:true,service:'ai-bridge-local',version:'test-local',commands_queued:1,commands_delivering:0}
    : req.url==='/control/status'
    ? {recent_commands:[{command_id:cmd,status:phase}]}
    : {ok:false};
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(body));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const gatewayUrl='http://127.0.0.1:'+address.port;
const testFetch=(...args)=>fetch(...args);
try{
  let r=await probeLocalBridgeCommand(undefined,{gatewayUrl,fetch:testFetch});
  assert.equal(r.phase,'health_only');assert.equal(r.networkCalls,1);assert.equal(r.stats.queued,1);
  for (const state of ['queued','delivering','acked','processed','failed']) {
    phase=state;
    r=await probeLocalBridgeCommand(cmd,{gatewayUrl,fetch:testFetch});
    assert.equal(r.phase,state);
    assert.equal(r.deliveryAcknowledged,['acked','processed'].includes(state));
    assert.equal(r.executionVerified,false);
    assert.equal(r.networkCalls,2);
  }
  r=await probeLocalBridgeCommand('HU-SUPPORT-LOCAL-SBX-AID-101',{gatewayUrl,fetch:testFetch});
  assert.equal(r.reason,'sandbox_command_id_only');assert.equal(r.networkCalls,0);
  r=await probeLocalBridgeCommand('HU-SBX-APPROVED-SBX-DEMO-001-deadbeefdeadbeefdead',{gatewayUrl,fetch:testFetch});
  assert.equal(r.phase,'not_observed');
  assert.ok(visits.every(([method,url])=>method==='GET'&&['/health','/control/status'].includes(url)));
  console.log('✅ Ordem 057: health, ledger, ACK e bloqueio de comandos reais validados em HTTP local');
}finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
