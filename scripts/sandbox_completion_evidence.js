'use strict';
// Ordem 068: nenhuma porcentagem implica execucao. So aceita prova vinculada a
// um comando SBX aprovado, ACK duravel, commit verificavel e relatorio íntegro.
// Todas as verificacoes externas sao callbacks explicitos (sem rede por default).
// Prova tecnica NAO significa aceitacao Master, solucao correta ou deploy.
const {createHash}=require('node:crypto');
const {approvalCommandId}=require('./approval_outbox.js');
const SANDBOX_REPO='HelpUSA/helpus-support-sandbox';
const SANDBOX_ID='SBX-E2E-063';
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const SAFE_REPORT=/^reports\/sbx\/SBX-E2E-063\/[A-Za-z0-9_.-]{1,80}\.md$/;
const SAFE_CODE=/^src\/sandbox\/[A-Za-z0-9_./-]{1,160}\.(?:js|ts|md)$/;
function fail(reason){
  return {ok:false,reason,evidenceVerified:false,executionVerified:false,
    masterAccepted:false,productionDeployed:false};
}
async function verifySandboxCompletionEvidence(input,callbacks={}) {
  if(!input||typeof input!=='object')return fail('evidence_missing');
  const {approval,bridge,proof}=input;
  if(!approval||approval.ok!==true||approval.ticketId!==SANDBOX_ID||
     approval.tenantId!=='sandbox'||typeof approval.jobKey!=='string'||
     typeof approval.approvalSignature!=='string'||!HEX64.test(approval.approvalSignature))
    return fail('verified_approval_required');
  const expectedCommand=approvalCommandId(approval);
  if(!bridge||bridge.ok!==true||bridge.commandId!==expectedCommand||
     bridge.phase!=='processed'||bridge.deliveryAcknowledged!==true||
     bridge.ackedAtPresent!==true||bridge.gatewayMarkedCompleted!==true)
    return fail('durable_processed_ack_required');
  if(!proof||proof.ticketId!==SANDBOX_ID||proof.commandId!==expectedCommand||
     proof.jobKey!==approval.jobKey||proof.repository!==SANDBOX_REPO||
     typeof proof.commitSha!=='string'||!HEX40.test(proof.commitSha)||
     typeof proof.reportPath!=='string'||!SAFE_REPORT.test(proof.reportPath)||
     typeof proof.reportSha256!=='string'||!HEX64.test(proof.reportSha256))
    return fail('sandbox_proof_identity_invalid');
  if(typeof callbacks.verifyCommit!=='function'||typeof callbacks.readReport!=='function')
    return fail('independent_verifiers_required');
  let check;
  try{
    check=await callbacks.verifyCommit({repository:SANDBOX_REPO,sha:proof.commitSha});
  }catch(_e){return fail('commit_lookup_failed')}
  if(!check||check.ok!==true||check.sha!==proof.commitSha||
     !Array.isArray(check.changedPaths)||check.changedPaths.length===0||
     !check.changedPaths.some(p=>typeof p==='string'&&SAFE_CODE.test(p)))
    return fail('sandbox_code_commit_unverified');
  // A commit may include the same report, or the report can be committed separately.
  // Verify content independently and bind it to the specific command & code SHA.
  let report;
  try{
    report=await callbacks.readReport({repository:SANDBOX_REPO,path:proof.reportPath});
  }catch(_e){return fail('report_lookup_failed')}
  if(!report||report.ok!==true||!Buffer.isBuffer(report.bytes)||
     report.bytes.length<100||report.bytes.length>65536)
    return fail('report_content_unverified');
  const digest=createHash('sha256').update(report.bytes).digest('hex');
  if(digest!==proof.reportSha256)return fail('report_hash_mismatch');
  const text=report.bytes.toString('utf8');
  if(!text.includes(SANDBOX_ID)||!text.includes(expectedCommand)||
     !text.includes(proof.commitSha)||!text.includes('SANDBOX'))
    return fail('report_not_bound_to_execution');
  return {
    ok:true,evidenceVerified:true,executionVerified:false,
    masterAccepted:false,productionDeployed:false,
    phase:'technical_evidence_verified_awaiting_master_acceptance',
    ticketId:SANDBOX_ID,commandId:expectedCommand,
    commitSha:proof.commitSha,reportSha256:digest,reportPath:proof.reportPath
  };
}
module.exports={verifySandboxCompletionEvidence};
