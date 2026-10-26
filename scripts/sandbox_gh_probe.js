'use strict';
// Ordem 063: inspecao manual e somente leitura do sandbox PRIVADO criado pelo operador.
// Usa a sessao GitHub CLI ja autorizada no Windows, sem ler/exportar tokens.
// Nenhum ticket é aprovado, escrito, despachado ou reenviado.
const {execFileSync}=require('node:child_process');
const STAGING_ENDPOINT='repos/HelpUSA/helpus-support-sandbox/contents/data/support_sbx_tickets.json?ref=main';
const SBX_ID=/^SBX-[A-Z0-9]{1,24}(?:-[A-Z0-9]{1,24}){0,3}$/;
function projectSandboxSnapshot(doc,ticketId) {
  if(!doc||doc.encoding!=='base64'||typeof doc.content!=='string'||
    doc.content.length>262144)return {ok:false,reason:'staging_content_unrecognized'};
  let array;
  try{
    const decoded=Buffer.from(doc.content.replace(/\s/g,''),'base64').toString('utf8');
    array=JSON.parse(decoded);
  }catch(_e){return {ok:false,reason:'staging_json_invalid'}}
  if(!Array.isArray(array)||array.length>100||
    !array.every(t=>t&&SBX_ID.test(t.id||'')&&t.id===t.code&&
      t.tenantId==='sandbox'&&Array.isArray(t.events)))
    return {ok:false,reason:'staging_snapshot_not_sandbox_only'};
  const rows=array.filter(t=>t.id===ticketId);
  if(rows.length!==1)return {ok:false,reason:'sandbox_ticket_not_unique'};
  const ticket=rows[0];
  const signedCandidates=ticket.events.filter(e=>e&&e.type==='master_approved'&&
    typeof e.signature==='string'&&/^[a-f0-9]{64}$/i.test(e.signature));
  return {
    ok:true,
    phase:'staging_read_only',
    source:'HelpUSA/helpus-support-sandbox:data/support_sbx_tickets.json',
    ticketId:ticket.id,tenantId:ticket.tenantId,status:ticket.status,
    signedApprovalCandidates:signedCandidates.length,
    approvalVerified:false, // requires EVENT_HMAC_SECRET and server-side auth verification
    localBridgeDeliveryAcknowledged:false,
    executionVerified:false
  };
}
function inspectStagingSandboxTicket(ticketId,options={}) {
  if(typeof ticketId!=='string'||!SBX_ID.test(ticketId))
    return {ok:false,reason:'sandbox_ticket_only',networkCalls:0};
  if(options.paused)return {ok:false,reason:'worker_paused',networkCalls:0};
  if(!options.confirmed)return {ok:false,reason:'explicit_readonly_confirmation_required',networkCalls:0};
  if(typeof options.reserve!=='function')
    return {ok:false,reason:'manual_request_budget_missing',networkCalls:0};
  const reservation=options.reserve('manual');
  if(!reservation||reservation.allowed!==true)
    return {ok:false,reason:'external_request_budget_blocked',networkCalls:0};
  let invocation=0;
  try{
    const runner=options.runGh||((bin,args,opts)=>execFileSync(bin,args,opts));
    invocation=1;
    const stdout=runner('gh',['api','-X','GET',STAGING_ENDPOINT,
      '-H','Accept: application/vnd.github+json'],{
      encoding:'utf8',timeout:6000,maxBuffer:512*1024,
      shell:false,windowsHide:true,
      env:{...process.env,GH_PROMPT_DISABLED:'1',GIT_TERMINAL_PROMPT:'0',
        GH_NO_UPDATE_NOTIFIER:'1',GH_HOST:'github.com',GH_PAGER:''}
    });
    if(typeof stdout!=='string')return {ok:false,reason:'gh_response_invalid',networkCalls:invocation};
    const data=JSON.parse(stdout);
    const projected=projectSandboxSnapshot(data,ticketId);
    return {...projected,networkCalls:invocation};
  }catch(_err){
    // Never print shell output, secrets, raw tickets or credential-adjacent errors.
    return {ok:false,reason:'private_staging_gh_read_failed',networkCalls:invocation};
  }
}

/**
 * Raw snapshot stays inside the local process, never exposed by the CLI.
 * Use preauthorized gh session instead of introducing a second PAT.
 */
function loadStagingTicketsViaGh(options={}) {
  if(options.paused)return {ok:false,reason:'worker_paused',networkCalls:0};
  if(!options.confirmed)return {ok:false,reason:'explicit_readonly_confirmation_required',networkCalls:0};
  if(typeof options.reserve!=='function')
    return {ok:false,reason:'manual_request_budget_missing',networkCalls:0};
  const quota=options.reserve('manual');
  if(!quota||quota.allowed!==true)
    return {ok:false,reason:'external_request_budget_blocked',networkCalls:0};
  let calls=0;
  try{
    const runner=options.runGh||((bin,args,opts)=>execFileSync(bin,args,opts));
    calls=1;
    const raw=runner('gh',['api','-X','GET',STAGING_ENDPOINT,
      '-H','Accept: application/vnd.github+json'],{
        encoding:'utf8',timeout:6000,maxBuffer:512*1024,
        shell:false,windowsHide:true,
        env:{...process.env,GH_PROMPT_DISABLED:'1',GIT_TERMINAL_PROMPT:'0',
          GH_NO_UPDATE_NOTIFIER:'1',GH_HOST:'github.com',GH_PAGER:''}
    });
    const doc=JSON.parse(raw);
    if(!doc || doc.encoding!=='base64'||typeof doc.content!=='string'||
      doc.content.length>262144)return {ok:false,reason:'invalid_staging_response',networkCalls:calls};
    const tickets=JSON.parse(Buffer.from(doc.content.replace(/\s/g,''),'base64').toString('utf8'));
    if(!Array.isArray(tickets)||tickets.length<1||tickets.length>100||
       !tickets.every(t=>t&&SBX_ID.test(t.id||'')&&t.code===t.id&&
         t.tenantId==='sandbox'&&Array.isArray(t.events))) {
      return {ok:false,reason:'staging_contains_non_sandbox_data',networkCalls:calls};
    }
    return {ok:true,tickets,networkCalls:calls};
  }catch(_e){
    return {ok:false,reason:'staging_private_read_failed',networkCalls:calls};
  }
}
module.exports={inspectStagingSandboxTicket,projectSandboxSnapshot,STAGING_ENDPOINT,loadStagingTicketsViaGh};
