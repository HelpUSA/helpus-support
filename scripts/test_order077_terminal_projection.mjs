// Ordem 077 — projeção de eventos HMAC e CAS seguro. Somente mocks e memória.
import assert from 'node:assert/strict';
import {materializeSignedTicketLifecycle,prepareTicketsForCAS,TicketStore} from '../src/lib/store.ts';
import {signTicketEvent} from '../src/lib/serverAuth.ts';
process.env.EVENT_HMAC_SECRET ||= 'isolated_order077_test_hmac_32bytes_0000000000';
const now = '2026-10-27T20:59:53.000Z';
const id='tck-sbx-order077',eventId='evt-res-077';
const signed = {
 id:eventId,ticketId:id,tenantId:'sandbox',type:'ticket_resolved',
 actorEmail:'ci.cd@helpusbr.com',actorRole:'system_pipeline',authorized:true,
 progressPercentage:100,status:'resolved',timestamp:now,seq:6,note:'offline regression only'
};
signed.signature=signTicketEvent(signed);
const oldProgress={
 ...signed,id:'evt-prg-077',type:'production_step',progressPercentage:75,
 status:'in_production',seq:5,timestamp:'2026-10-27T21:01:00.000Z'
};
oldProgress.signature=signTicketEvent(oldProgress);
const ticket={
 id,code:'SBX-077',tenantId:'sandbox',tenantName:'Sandbox',
 status:'resolved',progressPercentage:75,events:[oldProgress,signed],
 messages:[],createdAt:now,updatedAt:now
};
const projected=materializeSignedTicketLifecycle(ticket);
assert.equal(projected.status,'resolved');assert.equal(projected.progressPercentage,100);
assert.equal(ticket.progressPercentage,75,'must not rewrite historical input in place');
const remote={...ticket,events:[signed],progressPercentage:100,updatedAt:'2026-10-27T20:59:53.000Z'};
const stale={...ticket,status:'in_production',progressPercentage:75,events:[oldProgress],
 updatedAt:'2026-10-27T21:02:00.000Z'};
const merged=prepareTicketsForCAS([remote],[stale]);
assert.equal(merged.length,1);
assert.equal(merged[0].status,'resolved');
assert.equal(merged[0].progressPercentage,100);
assert.equal(merged[0].events.length,2);
const signatureTampered={...signed,note:'altered without resigning'};
const unsigned={...ticket,events:[signatureTampered]};
assert.equal(materializeSignedTicketLifecycle(unsigned).progressPercentage,75,
 'invalid HMAC must never grant a 100% projection');
const store = new TicketStore();
store.rehydrateTicket({...ticket,messages:[]});
const direct=store.completeTicketProduction(id,{success:true,solutionMessage:'offline proof only'},
 {deferSideEffects:true});
assert.equal(direct.progressPercentage,100,'complete must materialize 100 in root');
assert.equal(direct.status,'resolved');
const rejected=await store.updateTicketProgress(id,75,'stale writer');
assert.equal(rejected,undefined,'no later progress after terminal event');
const source=await import('node:fs/promises');
const path=new URL('../src/lib/store.ts',import.meta.url);
const code=await source.readFile(path,'utf8');
assert.ok(code.includes('/git/blobs/${latestSha}'), 'CAS must read exact remote blob');
assert.ok(code.includes('prepareTicketsForCAS(remoteTickets, currentTickets)'),
 'CAS must merge remote on FIRST attempt, not only HTTP 409');
console.log('✅ Ordem 077: verified terminal 100%, stale seq ignored, CAS merge and no progress after resolve');
