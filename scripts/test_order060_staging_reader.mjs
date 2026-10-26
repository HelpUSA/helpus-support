// Ordem 060: staging pull somente leitura; mocks impedem chamadas externas reais.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {validConfig,fetchSandboxTicketsFromGitHub}=require('./staging_sbx_reader.js');
const env={
  HELPUS_SANDBOX_DB_REPO:'HelpUSA/helpus-support-sandbox',
  HELPUS_SANDBOX_DB_PATH:'data/support_sbx_tickets.json',
  HELPUS_SANDBOX_DB_REF:'main',
  HELPUS_SANDBOX_GITHUB_TOKEN:'test_only_fake_staging_token'
};
let outbound=0, reservations=0;
const ticket={id:'SBX-STAGING-060',code:'SBX-STAGING-060',tenantId:'sandbox',events:[]};
const mock=(payload,status=200)=>async(url,options)=>{
  outbound++;
  assert.match(url,/repos\/HelpUSA\/helpus-support-sandbox\/contents\/data\/support_sbx_tickets\.json/);
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer '+env.HELPUS_SANDBOX_GITHUB_TOKEN);
  return {ok:status===200,status,json:async()=>({encoding:'base64',content:Buffer.from(JSON.stringify(payload)).toString('base64')})};
};
const reserve=()=>{reservations++;return {allowed:true}};
let r=await fetchSandboxTicketsFromGitHub({env,fetchFn:mock([ticket]),reserve});
assert.equal(r.reason,'explicit_operator_confirmation_required');
assert.equal(outbound,0);assert.equal(reservations,0);
r=await fetchSandboxTicketsFromGitHub({env,confirmed:true,paused:true,fetchFn:mock([ticket]),reserve});
assert.equal(r.reason,'worker_paused');assert.equal(outbound,0);
for(const invalid of [
  {...env,HELPUS_SANDBOX_DB_REPO:'HelpUSA/publicarte'},
  {...env,HELPUS_SANDBOX_DB_REPO:'HelpUSA/helpus-support'},
  {...env,HELPUS_SANDBOX_DB_REPO:'OtherOrg/helpus-staging'},
  {...env,HELPUS_SANDBOX_DB_PATH:'data/helpus_tickets.json'},
  {...env,HELPUS_SANDBOX_DB_PATH:'../data/support_sbx_tickets.json'},
  {...env,HELPUS_SANDBOX_GITHUB_TOKEN:''},
]){
  assert.equal(validConfig(invalid).ok,false);
  r=await fetchSandboxTicketsFromGitHub({env:invalid,confirmed:true,fetchFn:mock([ticket]),reserve});
  assert.equal(r.ok,false);
}
assert.equal(outbound,0);assert.equal(reservations,0);
r=await fetchSandboxTicketsFromGitHub({env,confirmed:true,fetchFn:mock([ticket]),reserve:()=>({allowed:false})});
assert.equal(r.reason,'external_budget_blocked');assert.equal(outbound,0);
r=await fetchSandboxTicketsFromGitHub({env,confirmed:true,fetchFn:mock([ticket]),reserve});
assert.equal(r.ok,true);assert.equal(r.tickets.length,1);assert.equal(r.networkCalls,1);
r=await fetchSandboxTicketsFromGitHub({env,confirmed:true,fetchFn:mock([{id:'AID-101',code:'AID-101',tenantId:'aidoctor',events:[]}]),reserve});
assert.equal(r.reason,'staging_contains_untrusted_or_real_ticket');
r=await fetchSandboxTicketsFromGitHub({env,confirmed:true,fetchFn:mock([ticket],404),reserve});
assert.equal(r.reason,'staging_read_failed');
const source=readFileSync(new URL('./antigravity_watcher.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf("args.some(a => a.startsWith('--dispatch-approved-sbx='))"),source.indexOf("args.some(a => a.startsWith('--dispatch-ticket='))"));
assert.ok(section.includes('oneShotPrivateSandbox'));
assert.ok(!section.includes('fetchSandboxTicketsFromGitHub'));
assert.ok(!section.includes('fetchTickets({}, {isManual:true})'));
assert.ok(section.includes('verifyEvent:verifyTicketEventIntegrity'));
assert.ok(section.includes('reserve:(kind)=>reserveExternalRequest(kind)'));
console.log('✅ Ordem 060: staging remoto isolado, uma leitura, sem prod, com cota e fail-closed (mocks offline)');
