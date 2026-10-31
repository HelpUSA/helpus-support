// Offline regression: approval receipt must not imply dispatch; failed persistence rolls back progress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpus-order051-'));
const keys=['HELPUS_DB_FILE','VERCEL','GITHUB_TOKEN','GH_TOKEN','SERVICE_WORKER_GITHUB_TOKEN'];
const oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
process.env.HELPUS_DB_FILE=path.join(dir,'tickets.json');process.env.VERCEL='1';
for(const k of ['GITHUB_TOKEN','GH_TOKEN','SERVICE_WORKER_GITHUB_TOKEN'])delete process.env[k];
try {
  const {TicketStore}=await import('../src/lib/store.ts');
  const store=new TicketStore(),id='SBX-ORDER-051-ROLLBACK';
  store.rehydrateTicket({id,code:id,tenantId:'sandbox',tenantName:'Sandbox',status:'in_production',progressPercentage:0,progressStep:'Aguardando',messages:[],events:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
  const before=JSON.parse(JSON.stringify(store.getTicketById(id)));
  const result=await store.updateTicketProgress(id,70,'Progresso fictício');
  assert.equal(result,undefined,'Fail-closed: no shared backend, no accepted progress');
  assert.deepEqual(store.getTicketById(id),before,'Rollback restores progress, messages and events');
  const source=fs.readFileSync(new URL('../src/lib/store.ts',import.meta.url),'utf8');
  const approval=source.slice(source.indexOf('  startTicketProduction('),source.indexOf('  async startTicketProductionAsync('));
  assert.ok(approval.includes('A execução ainda não foi iniciada'));
  assert.ok(!approval.includes('robô autônomo iniciou o processamento'));
  const route=fs.readFileSync(new URL('../src/app/api/tickets/[id]/route.ts',import.meta.url),'utf8');
  assert.ok(route.includes('executionDispatched: false'));
  assert.ok(route.includes('undefined, // approval must use server-owned record'));
  console.log('✅ Ordem 051: aprovação verídica, autoridade do servidor e rollback offline');
} finally {
  for(const [k,v] of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  fs.rmSync(dir,{recursive:true,force:true});
}
