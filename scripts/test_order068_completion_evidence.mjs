// Ordem 068: nenhuma chamada de rede, GitHub ou modelo; mocks com hashes verificaveis.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {verifySandboxCompletionEvidence}=require('./sandbox_completion_evidence.js');
const {approvalCommandId}=require('./approval_outbox.js');
const id='SBX-E2E-063';
const approval={ok:true,ticketId:id,tenantId:'sandbox',
 jobKey:'helpus-approval-outbox-v1:'+id+':evt-068',
 approvalSignature:'a'.repeat(64),approvalEventId:'evt-068'};
const commandId=approvalCommandId(approval);
const sha='f'.repeat(40);
const reportPath='reports/sbx/SBX-E2E-063/validation-068.md';
const bytes=Buffer.from('# SANDBOX validation\n'+id+'\n'+commandId+'\n'+sha+
 '\nReport is synthetic, not proof of deployment. This file documents code review only.\n');
const reportSha256=createHash('sha256').update(bytes).digest('hex');
const bridge={ok:true,commandId,phase:'processed',deliveryAcknowledged:true,
 ackedAtPresent:true,gatewayMarkedCompleted:true};
const proof={ticketId:id,commandId,jobKey:approval.jobKey,repository:'HelpUSA/helpus-support-sandbox',
 commitSha:sha,reportPath,reportSha256};
let codeChecks=0,reportReads=0;
const callbacks={
 verifyCommit:async({repository,sha:s})=>{
  codeChecks++;assert.equal(repository,proof.repository);assert.equal(s,sha);
  return {ok:true,sha,changedPaths:['src/sandbox/synthetic-test.js']};
 },
 readReport:async({repository,path})=>{
  reportReads++;assert.equal(repository,proof.repository);assert.equal(path,reportPath);
  return {ok:true,bytes};
 }
};
const input={approval,bridge,proof};
async function fails(changes,reason){
 const before=codeChecks;
 const result=await verifySandboxCompletionEvidence({...input,...changes},callbacks);
 assert.equal(result.ok,false);assert.equal(result.reason,reason);
 assert.equal(result.executionVerified,false);
 if(reason==='verified_approval_required'||reason==='durable_processed_ack_required'||
    reason==='sandbox_proof_identity_invalid')assert.equal(codeChecks,before);
}
await fails({approval:{...approval,ticketId:'AID-101'}},'verified_approval_required');
await fails({bridge:{...bridge,phase:'acked'}},'durable_processed_ack_required');
await fails({bridge:{...bridge,commandId:'other'}},'durable_processed_ack_required');
await fails({bridge:{...bridge,gatewayMarkedCompleted:false}},'durable_processed_ack_required');
await fails({proof:{...proof,repository:'HelpUSA/publicarte'}},'sandbox_proof_identity_invalid');
await fails({proof:{...proof,reportPath:'../secrets.md'}},'sandbox_proof_identity_invalid');
await fails({proof:{...proof,reportSha256:'0'.repeat(64)}},'report_hash_mismatch');
const noCode=await verifySandboxCompletionEvidence(input,{
 verifyCommit:async()=>({ok:true,sha,changedPaths:['docs/README.md']}),
 readReport:callbacks.readReport
});
assert.equal(noCode.ok,false);assert.equal(noCode.reason,'sandbox_code_commit_unverified');
const unbound=await verifySandboxCompletionEvidence(input,{
 verifyCommit:callbacks.verifyCommit,
 readReport:async()=>({ok:true,bytes:Buffer.from('SANDBOX\n'.repeat(20))})
});
assert.equal(unbound.ok,false);
const good=await verifySandboxCompletionEvidence(input,callbacks);
assert.equal(good.ok,true);assert.equal(good.evidenceVerified,true);
assert.equal(good.executionVerified,false);
assert.equal(good.masterAccepted,false);assert.equal(good.productionDeployed,false);
assert.equal(good.phase,'technical_evidence_verified_awaiting_master_acceptance');
assert.ok(codeChecks>0&&reportReads>0);
console.log('✅ Ordem 068: prova SBX exige SHA + relatorio hash + ACK processado; jamais auto-resolve/deploy (offline)');
