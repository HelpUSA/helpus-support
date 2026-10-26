'use strict';
// Ordem 060: ONE-SHOT pull autenticado somente-leitura de REPOSITÓRIO DE HOMOLOGAÇÃO.
// Proibido consultar HelpUSA/publicarte / data/helpus_tickets.json nesta função.
// Zero fallback público/raw; nenhuma escrita, retry, polling contínuo ou chamada de IA.
const STAGING_REPO=/^HelpUSA\/[A-Za-z0-9_.-]*(?:sandbox|staging)[A-Za-z0-9_.-]*$/;
const SAFE_PATH=/^data\/[A-Za-z0-9_.\/-]+\.json$/;
const SAFE_REF=/^[A-Za-z0-9._/-]{1,60}$/;
function validConfig(env={}) {
  const repo=String(env.HELPUS_SANDBOX_DB_REPO||'');
  const dbPath=String(env.HELPUS_SANDBOX_DB_PATH||'');
  const ref=String(env.HELPUS_SANDBOX_DB_REF||'main');
  const token=env.HELPUS_SANDBOX_GITHUB_TOKEN;
  if(!STAGING_REPO.test(repo) || repo.toLowerCase()==='helpusa/publicarte')
    return {ok:false,reason:'isolated_staging_repository_required'};
  if(!SAFE_PATH.test(dbPath) || dbPath.includes('..') ||
    dbPath==='data/helpus_tickets.json')
    return {ok:false,reason:'isolated_staging_path_required'};
  if(!SAFE_REF.test(ref) || ref.includes('..') || ref.startsWith('/'))
    return {ok:false,reason:'invalid_staging_ref'};
  if(typeof token!=='string' || token.trim().length===0)
    return {ok:false,reason:'staging_readonly_token_missing'};
  return {ok:true,repo,dbPath,ref,token};
}
async function fetchSandboxTicketsFromGitHub(options={}) {
  const {env=process.env,fetchFn=globalThis.fetch,reserve}=options;
  if(!options.confirmed)
    return {ok:false,reason:'explicit_operator_confirmation_required',networkCalls:0};
  if(options.paused)
    return {ok:false,reason:'worker_paused',networkCalls:0};
  const config=validConfig(env);
  if(!config.ok)return {ok:false,reason:config.reason,networkCalls:0};
  if(typeof reserve!=='function')
    return {ok:false,reason:'external_budget_reservation_missing',networkCalls:0};
  const budget=reserve('manual');
  if(!budget || budget.allowed!==true)
    return {ok:false,reason:'external_budget_blocked',networkCalls:0};
  // Precisely one outbound request to the configured staging repository.
  const url='https://api.github.com/repos/'+config.repo+'/contents/'+config.dbPath+
    '?ref='+encodeURIComponent(config.ref);
  try{
    const response=await fetchFn(url,{
      method:'GET',cache:'no-store',redirect:'error',
      headers:{
        Authorization:'Bearer '+config.token,
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'HelpUS-SBX-ReadOnly-Staging'
      },
      signal:AbortSignal.timeout(4500)
    });
    if(!response || !response.ok)
      return {ok:false,reason:'staging_read_failed',httpStatus:response&&response.status||0,networkCalls:1};
    const doc=await response.json();
    if(typeof doc.content!=='string' || doc.encoding!=='base64'||doc.content.length>4*1024*1024)
      return {ok:false,reason:'staging_content_unrecognized',networkCalls:1};
    const decoded=Buffer.from(doc.content.replace(/\s+/g,''),'base64').toString('utf8');
    const tickets=JSON.parse(decoded);
    if(!Array.isArray(tickets) || tickets.length>200 ||
      !tickets.every(t=>t && typeof t.id==='string' && /^SBX-[A-Z0-9-]+$/.test(t.id) &&
        t.id===t.code && t.tenantId==='sandbox' && Array.isArray(t.events)))
      return {ok:false,reason:'staging_contains_untrusted_or_real_ticket',networkCalls:1};
    return {ok:true,tickets,networkCalls:1,source:'isolated_staging'};
  }catch(_e){
    return {ok:false,reason:'staging_network_or_parse_error',networkCalls:1};
  }
}
module.exports={validConfig,fetchSandboxTicketsFromGitHub};
