// Ordem 059 — pipeline completo OFFLINE: registro -> assinatura -> fila mock -> ACK -> reinicio.
// Não conecta ao gateway real, GitHub, Vercel nem ao modelo Antigravity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {runSandboxE2EOnce,journalFile}=require('./sandbox_outbox_journal.js');
const {dispatchSandboxTicket}=require('./sandbox_dispatch.js');
const {probeLocalBridgeCommand}=require('./bridge_ack_probe.js');
const {signTicketEvent,verifyTicketEventIntegrity}=require('./antigravity_watcher.js');
process.env.EVENT_HMAC_SECRET='only_order059_sandbox_key_not_a_production_secret_123456';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpus-sbx-059-'));
const id='SBX-E2E-059';
const event={id:'evt-sbx-059',ticketId:id,tenantId:'sandbox',type:'master_approved',
  actorEmail:'synthetic-master@sandbox.invalid',actorRole:'master_superadmin',
  authorized:true,progressPercentage:0,status:'in_production',timestamp:new Date().toISOString(),
  note:'Offline synthetic test; NOT a Master approval',
  seq:1,idempotencyKey:'helpus-approval-outbox-v1:'+id+':evt-sbx-059'};
event.signature=signTicketEvent(event);
const ticket={id,code:id,tenantId:'sandbox',status:'in_production',progressPercentage:0,events:[event]};
const source=path.join(dir,'sandbox_ticket_snapshot.json');
fs.writeFileSync(source,JSON.stringify([ticket]),{mode:0o600});
let posts=0,acknowledged=false,lockBlocked=false;
const stored=new Map();
const server=createServer(async(req,res)=>{
  let body={ok:false};
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET' && req.url==='/health'){
    body={ok:true,service:'ai-bridge-local',version:'0.5.91',commands_queued:acknowledged?0:1,commands_delivering:0};
  }else if(req.method==='POST' && req.url==='/bridge/commands'){
    posts++;
    let raw='';
    for await(const part of req)raw+=part;
    const envelope=JSON.parse(raw);
    assert.equal(envelope.payload.sandbox,true);
    assert.equal(envelope.payload.approvalEventId,event.id);
    if(stored.has(envelope.command_id)){
      res.statusCode=409;body={ok:false,error:'duplicate'};
    }else{
      stored.set(envelope.command_id,envelope);
      body={ok:true,status:'queued',command_id:envelope.command_id};
    }
  }else if(req.method==='GET' && req.url?.startsWith('/bridge/r30/status?command_id=')){
    const cmd=new URL('http://localhost'+req.url).searchParams.get('command_id');
    if(stored.has(cmd)){
      body={ok:true,command_id:cmd,status:acknowledged?'acked':'queued',
        acked_at:acknowledged?new Date().toISOString():null,
        created_at:new Date().toISOString(),is_completed:false};
    }else{res.statusCode=404;body={ok:false,error:'not_found'}}
  }else{res.statusCode=404;body={ok:false,error:'unsupported'}}
  res.end(JSON.stringify(body));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const gatewayUrl='http://127.0.0.1:'+server.address().port;
const fetchMock=(...args)=>fetch(...args);
const controls={tempDir:dir,confirmed:true,env:{HELPUS_ALLOW_LOCAL_SBX_DISPATCH:'1'},
  allowedTenantIds:['sandbox'],verifyEvent:verifyTicketEventIntegrity,
  fetchTickets:async()=>JSON.parse(fs.readFileSync(source,'utf8')),
  dispatch:(id,props)=>dispatchSandboxTicket(id,{...props,fetch:fetchMock,gatewayUrl}),
  probe:(cmd)=>probeLocalBridgeCommand(cmd,{fetch:fetchMock,gatewayUrl})};
try{
  // Default must use no network and no ledger writes.
  let r=await runSandboxE2EOnce(id,{...controls,confirmed:false});
  assert.equal(r.phase,'prepared_only');
  assert.equal(posts,0);
  assert.equal(fs.existsSync(journalFile(dir)),false);
  r=await runSandboxE2EOnce('AID-101',controls);
  assert.equal(r.reason,'sandbox_ticket_only');assert.equal(posts,0);
  r=await runSandboxE2EOnce(id,{...controls,paused:true});
  assert.equal(r.reason,'worker_paused');assert.equal(posts,0);
  r=await runSandboxE2EOnce(id,{...controls,allowedTenantIds:['aidoctor']});
  assert.equal(r.reason,'tenant_not_allowed');assert.equal(posts,0);
  let t=JSON.parse(fs.readFileSync(source,'utf8'));
  t[0].events[0].note='tampered';
  fs.writeFileSync(source,JSON.stringify(t));
  r=await runSandboxE2EOnce(id,controls);
  assert.equal(r.reason,'unverifiable_ticket_history');assert.equal(posts,0);
  fs.writeFileSync(source,JSON.stringify([ticket]));

  // The real HTTP stack is exercised against a local in-memory mock server.
  r=await runSandboxE2EOnce(id,controls);
  assert.equal(r.ok,true);
  assert.equal(r.phase,'queued');assert.equal(r.newlyDispatched,true);
  assert.equal(r.deliveryAcknowledged,false);
  assert.equal(r.executionVerified,false);
  assert.equal(posts,1);
  assert.equal(stored.size,1);
  const cmd=r.commandId;
  assert.equal(fs.existsSync(journalFile(dir)),true);

  // A process restart must load the journal and query, never resend the same job.
  r=await runSandboxE2EOnce(id,controls);
  assert.equal(r.newlyDispatched,false);
  assert.equal(r.phase,'queued');assert.equal(posts,1);
  acknowledged=true; // fake gateway ACK; NOT code execution
  r=await runSandboxE2EOnce(id,controls);
  assert.equal(r.phase,'acked');
  assert.equal(r.deliveryAcknowledged,true);
  assert.equal(r.executionVerified,false);
  assert.equal(posts,1);
  r=await runSandboxE2EOnce(id,controls);
  assert.equal(r.phase,'acked');
  assert.equal(r.newlyDispatched,false);
  assert.equal(posts,1);
  const ledger=JSON.parse(fs.readFileSync(journalFile(dir),'utf8'));
  assert.equal(Object.keys(ledger.jobs).length,1);

  // Crash safety: journal with intent but no POST must not resend automatically.
  const crashDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpus-sbx-059-crash-'));
  try{
    fs.writeFileSync(journalFile(crashDir),JSON.stringify({
      format:'helpus_sbx_journal_v1',jobs:{[r.jobKey]:{
        jobKey:r.jobKey,commandId:cmd,phase:'intent',deliveryAcknowledged:false,
        executionVerified:false}}
    }));
    const before=posts;
    let after=await runSandboxE2EOnce(id,{...controls,tempDir:crashDir});
    assert.equal(after.newlyDispatched,false);
    assert.equal(posts,before);
  }finally{fs.rmSync(crashDir,{recursive:true,force:true})}

  // Corrupted state and exclusive lock must fail closed, with no extra dispatch.
  const journalPath=journalFile(dir);
  const old=fs.readFileSync(journalPath);
  fs.writeFileSync(journalPath,'corrupt');
  r=await runSandboxE2EOnce(id,controls);
  assert.equal(r.ok,false);assert.equal(r.reason,'sandbox_journal_corrupt');assert.equal(posts,1);
  fs.writeFileSync(journalPath,old);
  fs.writeFileSync(journalPath+'.lock','owned');
  r=await runSandboxE2EOnce(id,controls);
  assert.equal(r.ok,false);assert.equal(posts,1);
  fs.unlinkSync(journalPath+'.lock');
  console.log('✅ Ordem 059: SBX persistido + outbox HMAC + mock HTTP gateway + ACK + restart + idempotência + fail-closed');
}finally{
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  fs.rmSync(dir,{recursive:true,force:true});
}
