// test_order079_completion_gate_and_cas.mjs
// Ordem 079 — Testes de validação de Gate de Conclusão, Evidências e Anti-Regressão CAS.
import assert from 'node:assert/strict';
import { verifyTicketCompletionEvidence } from '../src/lib/completionEvidence.ts';
import { materializeSignedTicketLifecycle, prepareTicketsForCAS, TicketStore } from '../src/lib/store.ts';
import { signTicketEvent } from '../src/lib/serverAuth.ts';

process.env.EVENT_HMAC_SECRET ||= 'isolated_order079_test_hmac_32bytes_0000000000';

console.log('======================================================================');
console.log('SUITE DE TESTES ORDEM 079: GATES DE CONCLUSÃO E RESILIÊNCIA CAS');
console.log('======================================================================');

const mockTicket = {
  id: 'AID-122',
  code: 'AID-122',
  tenantId: 'aidoctor',
  tenantName: 'AIDoctor — Clínica Médica',
  title: 'Inserir indicador visual ONLINE',
  status: 'in_production',
  progressPercentage: 75,
  events: [],
  messages: [],
  createdAt: '2026-10-27T20:50:00.000Z',
  updatedAt: '2026-10-27T20:55:00.000Z',
};

const validEvidence = {
  ticketId: 'AID-122',
  tenantId: 'aidoctor',
  commandId: 'CMD-AID-122-EXEC-001',
  commitSha: 'b47b7e1575a30bfd772813cfe2330dc9d3926cd0',
  changedFiles: ['index.html'],
  deploymentId: 'dpl_5x48LmiAccHeD2H7dyUU4PinZ5ov',
  deploymentStatus: 'READY',
  deploymentTarget: 'production',
  deploymentCreatedAt: '2026-10-27T20:59:23.000Z',
  smokeTest: {
    status: 200,
    url: 'https://aidoctor.helpusbr.com',
    ok: true,
    containsExpectedPill: true,
  },
  reportSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  reportPath: 'reports/tickets/AID-122/laudo-tecnico.md',
};

// 1. Teste Negativo: Conclusão sem evidências
{
  const resNull = verifyTicketCompletionEvidence(mockTicket, null);
  assert.equal(resNull.ok, false);
  assert.equal(resNull.reason, 'evidence_missing');

  const resUndefined = verifyTicketCompletionEvidence(mockTicket, undefined);
  assert.equal(resUndefined.ok, false);
  assert.equal(resUndefined.reason, 'evidence_missing');
  console.log('✅ PASS: Rejeição estrita de conclusão sem evidências auditáveis');
}

// 2. Teste Negativo: Tenant incorreto (tentativa de cruzar tenants)
{
  const spoofedTenant = { ...validEvidence, tenantId: 'publicarte' };
  const res = verifyTicketCompletionEvidence(mockTicket, spoofedTenant);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'tenant_mismatch');
  console.log('✅ PASS: Rejeição estrita quando tenantId da evidência diverge do ticket');
}

// 3. Teste Negativo: Ticket ID incorreto
{
  const wrongTicketId = { ...validEvidence, ticketId: 'OTHER-999' };
  const res = verifyTicketCompletionEvidence(mockTicket, wrongTicketId);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'ticket_id_mismatch');
  console.log('✅ PASS: Rejeição estrita quando ticketId da evidência diverge do ticket alvo');
}

// 4. Teste Negativo: SHA de commit inválido ou divergente
{
  const invalidSha = { ...validEvidence, commitSha: 'not_a_sha' };
  const res1 = verifyTicketCompletionEvidence(mockTicket, invalidSha);
  assert.equal(res1.ok, false);
  assert.equal(res1.reason, 'invalid_commit_sha');

  const divergentSha = { ...validEvidence, commitSha: 'a'.repeat(40) };
  const res2 = verifyTicketCompletionEvidence(mockTicket, divergentSha, {
    expectedSha: 'b'.repeat(40),
  });
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'divergent_commit_sha');
  console.log('✅ PASS: Rejeição estrita de SHA malformado ou divergente do commit esperado');
}

// 5. Teste Negativo: Deployment Vercel não READY ou antigo (stale)
{
  const notReadyDeploy = { ...validEvidence, deploymentStatus: 'BUILDING' };
  const res1 = verifyTicketCompletionEvidence(mockTicket, notReadyDeploy);
  assert.equal(res1.ok, false);
  assert.equal(res1.reason, 'deployment_not_ready');

  const previewDeploy = { ...validEvidence, deploymentTarget: 'preview' };
  const res2 = verifyTicketCompletionEvidence(mockTicket, previewDeploy);
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'deployment_target_invalid');

  const staleDeploy = { ...validEvidence, deploymentCreatedAt: '2026-10-25T00:00:00.000Z' };
  const res3 = verifyTicketCompletionEvidence(mockTicket, staleDeploy, {
    minDeploymentTimestamp: '2026-10-27T00:00:00.000Z',
  });
  assert.equal(res3.ok, false);
  assert.equal(res3.reason, 'deployment_stale');
  console.log('✅ PASS: Rejeição estrita de deployment em preview, em compilação ou obsoleto');
}

// 6. Teste Negativo: Falha no Smoke Test HTTP Live
{
  const failedSmoke = {
    ...validEvidence,
    smokeTest: { ...validEvidence.smokeTest, status: 500, ok: false },
  };
  const res1 = verifyTicketCompletionEvidence(mockTicket, failedSmoke);
  assert.equal(res1.ok, false);
  assert.equal(res1.reason, 'smoke_test_failed');

  const missingUrl = {
    ...validEvidence,
    smokeTest: { status: 200, ok: true, url: '' },
  };
  const res2 = verifyTicketCompletionEvidence(mockTicket, missingUrl);
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'smoke_url_missing');
  console.log('✅ PASS: Rejeição estrita quando smoke test live falha ou não tem URL válida');
}

// 7. Teste Negativo: Hash de relatório técnico ausente ou inválido
{
  const invalidReportHash = { ...validEvidence, reportSha256: 'short_hash' };
  const res = verifyTicketCompletionEvidence(mockTicket, invalidReportHash);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'report_hash_invalid');
  console.log('✅ PASS: Rejeição estrita de relatório sem SHA-256 criptográfico de 64 caracteres');
}

// 8. Teste Positivo: Todas as evidências válidas
{
  const res = verifyTicketCompletionEvidence(mockTicket, validEvidence);
  assert.equal(res.ok, true);
  assert.equal(res.evidenceVerified, true);
  console.log('✅ PASS: Aprovação de evidência íntegra com vinculação completa');
}

// 9. Teste de Imutabilidade e Anti-Regressão (100% -> 75%)
{
  const store = new TicketStore();
  store.rehydrateTicket({ ...mockTicket, messages: [], events: [] });

  const resolved = store.completeTicketProduction('AID-122', {
    success: true,
    solutionMessage: 'Solução validada e comprovada em produção',
    evidence: validEvidence,
  }, { deferSideEffects: true });

  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.progressPercentage, 100);

  // Tentativa de regressão via updateTicketProgress posterior
  const regressionAttempt = await store.updateTicketProgress('AID-122', 75, 'stale progress');
  assert.equal(regressionAttempt, undefined, 'updateTicketProgress deve bloquear progresso posterior');

  const current = store.getTicketById('AID-122');
  assert.equal(current.status, 'resolved');
  assert.equal(current.progressPercentage, 100);

  // Projeção imutável
  const projected = materializeSignedTicketLifecycle(current);
  assert.equal(projected.status, 'resolved');
  assert.equal(projected.progressPercentage, 100);
  console.log('✅ PASS: Imutabilidade terminal contra regressão de 100% para 75%');
}

// 10. Teste de Concorrência CAS e Preservação de Eventos
{
  const signedResolvedEvt = {
    id: 'evt-res-079',
    ticketId: 'AID-122',
    tenantId: 'aidoctor',
    type: 'ticket_resolved',
    actorEmail: 'ci.cd@helpusbr.com',
    actorRole: 'system_pipeline',
    authorized: true,
    progressPercentage: 100,
    status: 'resolved',
    timestamp: '2026-10-27T21:00:00.000Z',
    seq: 6,
    note: 'Conclusão comprovada',
  };
  signedResolvedEvt.signature = signTicketEvent(signedResolvedEvt);

  const staleProgressEvt = {
    id: 'evt-prg-stale',
    ticketId: 'AID-122',
    tenantId: 'aidoctor',
    type: 'production_step',
    actorEmail: 'ci.cd@helpusbr.com',
    actorRole: 'system_pipeline',
    authorized: true,
    progressPercentage: 75,
    status: 'in_production',
    timestamp: '2026-10-27T21:01:00.000Z',
    seq: 5, // sequência inferior ao terminal 6
    note: 'Mensagem de progresso atrasada',
  };
  staleProgressEvt.signature = signTicketEvent(staleProgressEvt);

  const remote = {
    ...mockTicket,
    status: 'resolved',
    progressPercentage: 100,
    events: [signedResolvedEvt],
  };

  const localStale = {
    ...mockTicket,
    status: 'in_production',
    progressPercentage: 75,
    events: [staleProgressEvt],
  };

  const merged = prepareTicketsForCAS([remote], [localStale]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'resolved');
  assert.equal(merged[0].progressPercentage, 100);
  console.log('✅ PASS: Reconciliação CAS preserva resolução e descarta sobrescrita stale');
}

console.log('======================================================================');
console.log('🎉 TODOS OS 10 TESTES DA ORDEM 079 FORAM APROVADOS COM 100% DE SUCESSO!');
console.log('======================================================================');
