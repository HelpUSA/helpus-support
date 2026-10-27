// Ordem 080 — deny unverified completion; prevent client-exposed HMAC regression.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyTicketCompletionEvidence} from '../src/lib/completionEvidence.ts';
const source=readFileSync(new URL('../src/lib/serverAuth.ts',import.meta.url),'utf8');
assert.ok(!source.includes('NEXT_PUBLIC_SESSION_SECRET'));
assert.ok(!source.includes('NEXT_PUBLIC_EVENT_HMAC_SECRET'));
assert.ok(!source.includes('helpus_auth_hmac_sha256_internal_server_key_2026_secure'));
const ticket={id:'SBX-080',code:'SBX-080',tenantId:'sandbox'};
const structurallyValid={ticketId:'SBX-080',tenantId:'sandbox',
 commitSha:'a'.repeat(40),deploymentId:'dpl_'+('A'.repeat(24)),
 deploymentStatus:'READY',deploymentTarget:'production',
 smokeTest:{status:200,url:'https://aidoctor.helpusbr.com',ok:true},
 reportSha256:'b'.repeat(64)};
const observed=verifyTicketCompletionEvidence(ticket,structurallyValid);
assert.equal(observed.ok,false);
assert.equal(observed.reason,'trusted_server_verification_unavailable');
assert.equal(observed.evidenceVerified,false);
console.log('✅ Ordem 080: reject caller-asserted READY/HTTP200/commit; remove public/static keys');
