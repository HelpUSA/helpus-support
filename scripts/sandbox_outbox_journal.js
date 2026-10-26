'use strict';
// Ordem 059: journal de despacho local e reconciliacao do ACK com comprovante.
// Isto NAO e uma ponte com Vercel; utiliza exclusivamente SBX e arquivo em diretório temporário.
// A INTENCAO persiste ANTES do POST ao gateway. Na retomada, consulta estado antes de tentar enviar.
// Nunca envia automaticamente uma segunda vez (inclusive depois de crash, timeout ou HTTP 409).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { selectSandboxApproval, approvalCommandId } = require('./approval_outbox.js');
const FORMAT='helpus_sbx_journal_v1';
const VALID_PHASES=new Set(['intent','queued','uncertain','acked','failed']);

function journalFile(tempDir) {
  if (typeof tempDir !== 'string' || !tempDir.trim()) throw Error('sandbox_temp_directory_required');
  const root=path.resolve(os.tmpdir());
  const dir=path.resolve(tempDir);
  if(!dir.startsWith(root+path.sep) || dir.includes('..'+path.sep))
    throw Error('sandbox_journal_must_be_inside_os_temp');
  if(fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw Error('sandbox_symlink_rejected');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const dirReal=fs.realpathSync(dir), rootReal=fs.realpathSync(root);
  if(!dirReal.startsWith(rootReal+path.sep))throw Error('sandbox_realpath_outside_temp');
  return path.join(dirReal,'helpus_sbx_outbox_journal.json');
}
function readJournal(file) {
  if(!fs.existsSync(file))return {format:FORMAT,jobs:{}};
  if(fs.lstatSync(file).isSymbolicLink())throw Error('sandbox_journal_symlink_rejected');
  const raw=fs.readFileSync(file,'utf8');
  let data;
  try{data=JSON.parse(raw)}catch{throw Error('sandbox_journal_corrupt')}
  if(!data || data.format!==FORMAT || !data.jobs || typeof data.jobs!=='object' ||
      Array.isArray(data.jobs)) throw Error('sandbox_journal_invalid_schema');
  for(const value of Object.values(data.jobs)){
    if(!value || !VALID_PHASES.has(value.phase) || typeof value.commandId!=='string' ||
       typeof value.jobKey!=='string') throw Error('sandbox_journal_invalid_entry');
  }
  return data;
}
function atomicWrite(file,data) {
  const temp=file+'.'+process.pid+'.tmp';
  // Fail closed on any write error. Ensure file data is flushed before atomically replacing.
  let fd;
  try{
    fd=fs.openSync(temp,'wx',0o600);
    fs.writeFileSync(fd,JSON.stringify(data,null,2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);fd=undefined;
    fs.renameSync(temp,file);
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
    if(fs.existsSync(temp))fs.unlinkSync(temp);
  }
}
async function withExclusiveJournal(file,fn) {
  const lockFile=file+'.lock';
  let fd;
  try {
    fd=fs.openSync(lockFile,'wx',0o600);
    fs.writeFileSync(fd,String(process.pid));fs.fsyncSync(fd);
    return await fn();
  }finally{
    if(fd!==undefined){
      fs.closeSync(fd);
      fs.unlinkSync(lockFile);
    }
  }
}
function safeResult(err) {
  return {ok:false,phase:'blocked',reason:err&&err.message||'sandbox_internal_error',
    deliveryAcknowledged:false,executionVerified:false};
}
async function runSandboxE2EOnce(ticketId,options={}) {
  if(!/^SBX-[A-Z0-9]{1,24}(?:-[A-Z0-9]{1,24}){0,3}$/.test(ticketId||''))
    return {ok:false,phase:'blocked',reason:'sandbox_ticket_only',networkCalls:0};
  if(options.paused)return {ok:false,phase:'blocked',reason:'worker_paused',networkCalls:0};
  if(!options.confirmed || (options.env||{}).HELPUS_ALLOW_LOCAL_SBX_DISPATCH!=='1')
    return {ok:true,phase:'prepared_only',networkCalls:0,executionVerified:false};
  if(typeof options.fetchTickets!=='function' || typeof options.verifyEvent!=='function' ||
      typeof options.dispatch!=='function' || typeof options.probe!=='function')
    return {ok:false,phase:'blocked',reason:'missing_staging_adapters',networkCalls:0};
  let file;
  try{file=journalFile(options.tempDir)}catch(e){return safeResult(e)}
  try {
    return await withExclusiveJournal(file,async()=>{
      const tickets=await options.fetchTickets();
      const approval=selectSandboxApproval(tickets,ticketId,options.verifyEvent,{
        allowedTenantIds:options.allowedTenantIds
      });
      if(!approval.ok)return {ok:false,phase:'blocked',reason:approval.reason,executionVerified:false};
      const commandId=approvalCommandId(approval);
      const key=approval.jobKey;
      const data=readJournal(file);
      let row=data.jobs[key];
      if(row && (row.commandId!==commandId || row.jobKey!==key))
        return {ok:false,phase:'blocked',reason:'journal_identity_mismatch',executionVerified:false};
      let newlyDispatched=false;
      if(!row){
        row={jobKey:key,commandId,phase:'intent',createdAt:new Date().toISOString(),
          deliveryAcknowledged:false,executionVerified:false};
        data.jobs[key]=row;
        atomicWrite(file,data); // crash here: no POST; next run only queries ID
        newlyDispatched=true;
        let sent;
        try{
          sent=await options.dispatch(ticketId,{
            commandId,verifiedApproval:approval,confirmed:true,
            env:options.env,paused:false
          });
        }catch(_error){
          sent={ok:false,phase:'uncertain_delivery'};
        }
        row.phase=sent && sent.phase==='queued_only'?'queued':'uncertain';
        row.lastDispatchPhase=sent && sent.phase || 'uncertain_delivery';
        row.updatedAt=new Date().toISOString();
        atomicWrite(file,data);
      }
      // Can reconcile existing intent, even after a restart. Never resend by default.
      let state;
      try{state=await options.probe(commandId)}catch(_e){state={ok:false,reason:'probe_failed'}};
      if(state && state.ok && state.commandId===commandId &&
         state.deliveryAcknowledged===true && state.ackedAtPresent===true &&
         ['acked','processed','failed'].includes(state.phase)){
        row.phase=state.phase==='failed'?'failed':'acked';
        row.deliveryAcknowledged=true;
        row.gatewayPhase=state.phase;
        row.ackCheckedAt=new Date().toISOString();
        atomicWrite(file,data);
      }
      return {
        ok:true,phase:row.phase,commandId,jobKey:key,newlyDispatched,
        dispatchAttempts:1, // only one attempt ever for a given jobKey within this journal
        deliveryAcknowledged:row.deliveryAcknowledged===true,
        gatewayPhase:row.gatewayPhase||null,
        executionVerified:false,
        durableJournal:true
      };
    });
  }catch(e){return safeResult(e)}
}
module.exports={runSandboxE2EOnce,journalFile,readJournal};
