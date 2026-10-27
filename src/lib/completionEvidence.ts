/**
 * completionEvidence.ts
 * Ordem 079 — Gate de Conclusão no Backend
 * 
 * Nenhuma porcentagem ou ACK numérico pode substituir evidências auditáveis vinculadas.
 * A resolução de um chamado exige comprovação obrigatória de:
 * 1. Alteração real no código (SHA do commit de 40 caracteres hex).
 * 2. Deployment Vercel READY no target de produção.
 * 3. Smoke test HTTP 200 no domínio público.
 * 4. Relatório técnico com hash SHA-256 de 64 caracteres hex.
 * 5. Vinculação estrita a ticketId e tenantId.
 */

import type { Ticket } from '@/types/ticket';

export interface CompletionEvidence {
  ticketId: string;
  tenantId: string;
  commandId?: string;
  commitSha: string;
  changedFiles?: string[];
  deploymentId: string;
  deploymentStatus: 'READY' | 'BUILDING' | 'ERROR' | 'CANCELED' | string;
  deploymentTarget?: 'production' | 'preview' | string;
  deploymentCreatedAt?: string;
  smokeTest: {
    status: number;
    url: string;
    verifiedAt?: string;
    containsExpectedPill?: boolean;
    ok: boolean;
  };
  reportSha256: string;
  reportPath?: string;
  timestamp?: string;
}

export interface VerificationResult {
  ok: boolean;
  reason?: string;
  evidenceVerified: boolean;
}

const HEX40 = /^[a-f0-9]{40}$/i;
const HEX64 = /^[a-f0-9]{64}$/i;

export function verifyTicketCompletionEvidence(
  ticket: Ticket,
  evidence: CompletionEvidence | undefined | null,
  options?: {
    expectedSha?: string;
    minDeploymentTimestamp?: string;
  }
): VerificationResult {
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, reason: 'evidence_missing', evidenceVerified: false };
  }

  // 1. Vinculação Estrita de Identidade (Ticket e Tenant)
  if (evidence.ticketId !== ticket.id && evidence.ticketId !== ticket.code) {
    return { ok: false, reason: 'ticket_id_mismatch', evidenceVerified: false };
  }

  if (evidence.tenantId !== ticket.tenantId) {
    return { ok: false, reason: 'tenant_mismatch', evidenceVerified: false };
  }

  // 2. Prova de Alteração Real no Código
  if (!evidence.commitSha || typeof evidence.commitSha !== 'string' || !HEX40.test(evidence.commitSha)) {
    return { ok: false, reason: 'invalid_commit_sha', evidenceVerified: false };
  }

  if (options?.expectedSha && evidence.commitSha.toLowerCase() !== options.expectedSha.toLowerCase()) {
    return { ok: false, reason: 'divergent_commit_sha', evidenceVerified: false };
  }

  // 3. Prova de Deployment na Vercel
  if (!evidence.deploymentId || typeof evidence.deploymentId !== 'string' || !evidence.deploymentId.startsWith('dpl_')) {
    return { ok: false, reason: 'invalid_deployment_id', evidenceVerified: false };
  }

  if (evidence.deploymentStatus !== 'READY') {
    return { ok: false, reason: 'deployment_not_ready', evidenceVerified: false };
  }

  if (evidence.deploymentTarget && evidence.deploymentTarget !== 'production') {
    return { ok: false, reason: 'deployment_target_invalid', evidenceVerified: false };
  }

  if (options?.minDeploymentTimestamp && evidence.deploymentCreatedAt) {
    const deployTime = new Date(evidence.deploymentCreatedAt).getTime();
    const minTime = new Date(options.minDeploymentTimestamp).getTime();
    if (deployTime < minTime) {
      return { ok: false, reason: 'deployment_stale', evidenceVerified: false };
    }
  }

  // 4. Prova de Smoke Test HTTP Live
  if (!evidence.smokeTest || typeof evidence.smokeTest !== 'object') {
    return { ok: false, reason: 'smoke_test_missing', evidenceVerified: false };
  }

  if (evidence.smokeTest.status !== 200 || evidence.smokeTest.ok !== true) {
    return { ok: false, reason: 'smoke_test_failed', evidenceVerified: false };
  }

  if (!evidence.smokeTest.url || typeof evidence.smokeTest.url !== 'string') {
    return { ok: false, reason: 'smoke_url_missing', evidenceVerified: false };
  }

  // 5. Relatório Técnico com Hash Criptográfico
  if (!evidence.reportSha256 || typeof evidence.reportSha256 !== 'string' || !HEX64.test(evidence.reportSha256)) {
    return { ok: false, reason: 'report_hash_invalid', evidenceVerified: false };
  }

  return {
    ok: true,
    evidenceVerified: true,
  };
}
