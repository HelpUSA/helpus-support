// Ordem 063: testes determinísticos; nunca executam gh real nem fazem HTTP externo.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {inspectStagingSandboxTicket,projectSandboxSnapshot,STAGING_ENDPOINT}=require('./sandbox_gh_probe.js');
const id='SBX-E2E-063';
const ticket={id,code:id,tenantId:'sandbox',status:'pending_approval',events:[]};
const doc={encoding:'base64',content:Buffer.from(JSON.stringify([ticket])).toString('base64')};
let calls=0,budgets=0;
const runner=(bin,args,opts)=>{
  calls++;
  assert.equal(bin,'gh');
  assert.deepEqual(args,['api','-X','GET',STAGING_ENDPOINT,'-H','Accept: application/vnd.github+json']);
  assert.equal(opts.shell,false);
  assert.equal(opts.env.GH_PROMPT_DISABLED,'1');
  return JSON.stringify(doc);
};
const reserve=()=>{budgets++;return {allowed:true}};
const opts={runGh:runner,reserve,confirmed:true};
assert.equal(inspectStagingSandboxTicket(id,{...opts,confirmed:false}).reason,
  'explicit_readonly_confirmation_required');
assert.equal(inspectStagingSandboxTicket(id,{...opts,paused:true}).reason,'worker_paused');
assert.equal(inspectStagingSandboxTicket('AID-101',opts).reason,'sandbox_ticket_only');
assert.equal(inspectStagingSandboxTicket('BRA-115',opts).reason,'sandbox_ticket_only');
assert.equal(calls,0);assert.equal(budgets,0);
assert.equal(inspectStagingSandboxTicket(id,{...opts,reserve:()=>({allowed:false})}).reason,
  'external_request_budget_blocked');
assert.equal(calls,0);
const ok=inspectStagingSandboxTicket(id,opts);
assert.equal(ok.ok,true);assert.equal(ok.phase,'staging_read_only');
assert.equal(ok.approvalVerified,false);assert.equal(ok.executionVerified,false);
assert.equal(ok.signedApprovalCandidates,0);assert.equal(calls,1);assert.equal(budgets,1);
const malicious={...ticket,id:'AID-101',code:'AID-101'};
assert.equal(projectSandboxSnapshot({encoding:'base64',content:Buffer.from(JSON.stringify([malicious])).toString('base64')},id).reason,'staging_snapshot_not_sandbox_only');
assert.equal(projectSandboxSnapshot(doc,'SBX-NONEXISTENT').reason,'sandbox_ticket_not_unique');
const watcher=readFileSync(new URL('./antigravity_watcher.js',import.meta.url),'utf8');
const section=watcher.slice(watcher.indexOf("args.some(a => a.startsWith('--inspect-staging-sbx='))"),watcher.indexOf("args.some(a => a.startsWith('--dispatch-approved-sbx='))"));
assert.ok(section.includes('inspectStagingSandboxTicket'));
assert.ok(!section.includes('--send-local'));
console.log('✅ Ordem 063: staging privado via gh API GET isolado, sem escrita, tokens ou tickets reais');
