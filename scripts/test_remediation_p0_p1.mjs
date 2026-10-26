// scripts/test_remediation_p0_p1.mjs
// Suite Completa de Testes Comportamentais com Mocks de Rede (P0/P1 Terceira Auditoria)
// Atende integralmente às exigências da Terceira Auditoria Independente (Issue Comment 6405737739)

import assert from 'node:assert/strict';
import {
  TENANTS,
  processTicket,
  fetchTickets,
  saveTickets,
  verifyCommit,
  verifyDeployment,
  mergeTicketsGranular
} from './antigravity_watcher.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

console.log('='.repeat(80));
console.log('SUITE DE TESTES COMPORTAMENTAIS: TERCEIRA AUDITORIA PR #1 (P0/P1)');
console.log('='.repeat(80));

// ---------------------------------------------------------------------------
// TESTE 1: Preservação de Mensagens e Monotonicidade de Estado (P0-04 & P1)
// ---------------------------------------------------------------------------
await test('P0-04 & P1: mergeTicketsGranular preserva mensagens concorrentes e impede regressão de status', () => {
  const remoteTickets = [
    {
      id: 'AID-101',
      code: 'AID-101',
      title: 'Remoção texto do CRM',
      tenantId: 'aidoctor',
      status: 'pending_approval',
      updatedAt: '2026-10-25T20:10:00.000Z',
      progressPercentage: 25,
      messages: [
        { id: 'm1', createdAt: '2026-10-25T20:01:00.000Z', senderId: 'cliente@helpus.com', content: 'Msg concorrente cliente' }
      ]
    }
  ];

  const localTickets = [
    {
      id: 'AID-101',
      code: 'AID-101',
      title: 'Remoção texto do CRM',
      tenantId: 'aidoctor',
      status: 'in_production',
      updatedAt: '2026-10-25T20:05:00.000Z',
      progressPercentage: 75,
      messages: [
        { id: 'm2', createdAt: '2026-10-25T20:02:00.000Z', senderId: 'agente@helpus.com', content: 'Msg concorrente agente' }
      ]
    }
  ];

  const merged = mergeTicketsGranular(remoteTickets, localTickets);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].messages.length, 2, 'Ambas as mensagens concorrentes devem ser preservadas');
  assert.equal(merged[0].status, 'in_production', 'Status in_production não deve regredir para pending_approval');
  assert.equal(merged[0].progressPercentage, 75, 'Progresso mais avançado não deve regredir');
});

// ---------------------------------------------------------------------------
// TESTE 2: CAS 409 Concurrency no saveTickets com Reconciliação
// ---------------------------------------------------------------------------
await test('P0-02 & P0-04: saveTickets resolve 409 via CAS, reconcilia e envia payload mesclado', async () => {
  let putCount = 0;
  let putPayloads = [];

  const mockRemoteTickets = [
    {
      id: 'T-100',
      code: 'T-100',
      tenantId: 'aidoctor',
      status: 'in_production',
      updatedAt: '2026-10-25T20:00:00.000Z',
      messages: [{ id: 'm-remote-1', createdAt: '2026-10-25T20:00:00.000Z', content: 'Msg remota concorrente' }]
    }
  ];

  const mockFetch = async (url, options = {}) => {
    if (!options.method || options.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: putCount === 0 ? 'sha-initial-111' : 'sha-updated-222',
          content: Buffer.from(JSON.stringify(mockRemoteTickets)).toString('base64')
        })
      };
    }

    if (options.method === 'PUT') {
      putCount++;
      const body = JSON.parse(options.body);
      putPayloads.push(body);

      if (putCount === 1) {
        return {
          ok: false,
          status: 409,
          text: async () => 'Resource was modified by another writer (conflict)'
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ content: { sha: 'sha-final-333' } })
      };
    }

    return { ok: false, status: 500 };
  };

  const initialLocalTickets = [
    {
      id: 'T-100',
      code: 'T-100',
      tenantId: 'aidoctor',
      status: 'in_production',
      updatedAt: '2026-10-25T20:05:00.000Z',
      messages: [{ id: 'm-local-1', createdAt: '2026-10-25T20:05:00.000Z', content: 'Msg local agente' }]
    }
  ];

  const result = await saveTickets(initialLocalTickets, 3, {
    fetch: mockFetch,
    githubToken: 'ghp_mock_token'
  });

  assert.equal(result, true);
  assert.equal(putCount, 2);
  const secondPutContent = JSON.parse(Buffer.from(putPayloads[1].content, 'base64').toString('utf-8'));
  assert.equal(secondPutContent[0].messages.length, 2);
});

// ---------------------------------------------------------------------------
// TESTE 3: CAS 409 com Falha de Re-Fetch Aborta Retry (P1)
// ---------------------------------------------------------------------------
await test('P1: saveTickets aborta imediatamente se o re-fetch falhar durante tratamento de 409', async () => {
  let putCount = 0;
  const mockFetchFailRefetch = async (url, options = {}) => {
    if (!options.method || options.method === 'GET') {
      if (putCount === 0) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: 'sha-1', content: Buffer.from(JSON.stringify([])).toString('base64') })
        };
      }
      // Re-fetch falha após o 409
      return { ok: false, status: 500, text: async () => 'Database server error' };
    }

    if (options.method === 'PUT') {
      putCount++;
      return { ok: false, status: 409, text: async () => 'Conflict' };
    }

    return { ok: false, status: 500 };
  };

  const result = await saveTickets([{ id: 'T-ABORT', status: 'in_production' }], 3, {
    fetch: mockFetchFailRefetch,
    githubToken: 'ghp_mock_token'
  });

  assert.equal(result, false, 'Deve retornar false imediatamente ao falhar re-fetch em 409');
});

// ---------------------------------------------------------------------------
// TESTE 4: Verificação de Retorno de okHold (P1-01)
// ---------------------------------------------------------------------------
await test('P1-01: processTicket checa estritamente okHold e falha se a persistência de espera falhar', async () => {
  let putCount = 0;
  const mockFetchFailOnHold = async (url, options = {}) => {
    if (!options.method || options.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'sha-hold-1',
          content: Buffer.from(JSON.stringify([{
            id: 'T-HOLD',
            code: 'T-HOLD',
            tenantId: 'aidoctor',
            status: 'in_production'
          }])).toString('base64')
        })
      };
    }
    if (options.method === 'PUT') {
      putCount++;
      if (putCount === 1) {
        return { ok: true, status: 200, json: async () => ({ content: { sha: 'sha-hold-2' } }) };
      }
      return { ok: false, status: 500, text: async () => 'GitHub Storage Service Unavailable' };
    }
    return { ok: false, status: 500 };
  };

  const ticketWithoutCommit = {
    id: 'T-HOLD',
    code: 'T-HOLD',
    title: 'Aguardando implementação',
    tenantId: 'aidoctor',
    status: 'in_production'
  };

  const result = await processTicket(ticketWithoutCommit, { allowAutonomousDeploy: true }, {
    fetch: mockFetchFailOnHold,
    githubToken: 'mock_token'
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'cloud_save_failed_at_hold');
});

// ---------------------------------------------------------------------------
// TESTE 5: P0-A - SHA Inventado de 40 Dígitos Rejeitado Sem Consulta GitHub
// ---------------------------------------------------------------------------
await test('P0-A: verifyCommit rejeita SHA inventado de 40 dígitos e exige resposta verificada do GitHub', async () => {
  const inventedSha = '0000000000000000000000000000000000000000';
  const tenant = TENANTS.aidoctor;

  // 1. Sem token: rejeitado (sem bypass de string length)
  const noTokenResult = await verifyCommit(tenant, inventedSha, { githubToken: '' });
  assert.equal(noTokenResult.valid, false);
  assert.equal(noTokenResult.reason, 'unverified_commit_remote_check_required_no_token');

  // 2. Com token, mas GitHub retorna 404: rejeitado
  const mockFetch404 = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });
  const gitHub404Result = await verifyCommit(tenant, inventedSha, {
    fetch: mockFetch404,
    githubToken: 'valid_token'
  });
  assert.equal(gitHub404Result.valid, false);
  assert.equal(gitHub404Result.reason, 'commit_not_found_on_github_status_404');
});

// ---------------------------------------------------------------------------
// TESTE 6: P0-A - Commit Legítimo Comprovado no Repositório
// ---------------------------------------------------------------------------
await test('P0-A: verifyCommit valida commit legítimo com SHA canônico no GitHub', async () => {
  const legitimateSha = '00eb4bde8d25a84853acf805dcad5de62f2077ec';
  const tenant = TENANTS.aidoctor;

  const mockFetch200 = async (url) => {
    if (url.includes(legitimateSha)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: legitimateSha,
          commit: { message: 'fix(audit-r2): correcao' }
        })
      };
    }
    return { ok: false, status: 404 };
  };

  const result = await verifyCommit(tenant, legitimateSha, {
    fetch: mockFetch200,
    githubToken: 'valid_token'
  });

  assert.equal(result.valid, true);
  assert.equal(result.fullSha, legitimateSha);
});

// ---------------------------------------------------------------------------
// TESTE 7: P0-B - Rejeição de Vercel Deployment com Target Inválido / Preview
// ---------------------------------------------------------------------------
await test('P0-B: verifyDeployment rejeita deployment com target ausente ou preview', async () => {
  const tenant = TENANTS.aidoctor;
  const legitimateSha = '00eb4bde8d25a84853acf805dcad5de62f2077ec';

  const mockFetchPreview = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 'dpl_preview',
      status: 'READY',
      target: 'preview', // Target não é production
      meta: { githubCommitSha: legitimateSha }
    })
  });

  const result = await verifyDeployment(tenant, {
    deploymentId: 'dpl_preview',
    expectedSha: legitimateSha,
    vercelToken: 'v_token'
  }, { fetch: mockFetchPreview });

  assert.equal(result.ready, false);
  assert.equal(result.reason, 'invalid_target_preview');
});

// ---------------------------------------------------------------------------
// TESTE 8: P0-B - Rejeição de Vercel Deployment com Commit Divergente
// ---------------------------------------------------------------------------
await test('P0-B: verifyDeployment rejeita deployment cujo commit não corresponde ao commit aprovado', async () => {
  const tenant = TENANTS.aidoctor;
  const approvedSha = '00eb4bde8d25a84853acf805dcad5de62f2077ec';
  const differentSha = 'ffffffffffffffffffffffffffffffffffffffff';

  const mockFetchMismatchSha = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 'dpl_prod',
      status: 'READY',
      target: 'production',
      meta: { githubCommitSha: differentSha }
    })
  });

  const result = await verifyDeployment(tenant, {
    deploymentId: 'dpl_prod',
    expectedSha: approvedSha,
    vercelToken: 'v_token'
  }, { fetch: mockFetchMismatchSha });

  assert.equal(result.ready, false);
  assert.match(result.reason, /commit_sha_mismatch_deployment/);
});

// ---------------------------------------------------------------------------
// TESTE 9: P0-B - Rejeição de Smoke Test Genérico HTTP 200 Isolado
// ---------------------------------------------------------------------------
await test('P0-B: verifyDeployment rejeita HTTP 200 genérico de domínio sem comprovação específica', async () => {
  const tenant = TENANTS.aidoctor;
  // Smoke test genérico sem assertFn e sem header de commit
  const mockFetchGeneric200 = async () => ({
    ok: true,
    status: 200,
    text: async () => '<html>Landing Page Antiga</html>',
    headers: new Map()
  });

  const result = await verifyDeployment(tenant, {
    expectedSha: '00eb4bde8d25a84853acf805dcad5de62f2077ec',
    smokeTestSpecific: { url: 'https://aidoctor.helpusbr.com' }
  }, { fetch: mockFetchGeneric200 });

  assert.equal(result.ready, false);
  assert.equal(result.reason, 'smoke_test_lacks_commit_provenance');
});

// ---------------------------------------------------------------------------
// TESTE 10: P0-B - Vercel Deployment READY Comprovado em Produção com Commit Exato
// ---------------------------------------------------------------------------
await test('P0-B: verifyDeployment aprova deployment READY comprovado em produção com SHA exato', async () => {
  const tenant = TENANTS.aidoctor;
  const approvedSha = '00eb4bde8d25a84853acf805dcad5de62f2077ec';

  const mockFetchReadyProd = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 'dpl_prod_verified',
      status: 'READY',
      readyState: 'READY',
      target: 'production',
      meta: { githubCommitSha: approvedSha },
      url: 'https://aidoctor.helpusbr.com'
    })
  });

  const result = await verifyDeployment(tenant, {
    deploymentId: 'dpl_prod_verified',
    expectedSha: approvedSha,
    vercelToken: 'v_token'
  }, { fetch: mockFetchReadyProd });

  assert.equal(result.ready, true);
  assert.equal(result.target, 'production');
  assert.equal(result.sha, approvedSha);
});

// ---------------------------------------------------------------------------
// TESTE 11: Rejeição Estrita de Tenant Desconhecido (P1-01)
// ---------------------------------------------------------------------------
await test('P1-01: Rejeitar estritamente tenant desconhecido com erro de segurança e sem fallback', async () => {
  const invalidTicket = {
    id: 'T-INV',
    code: 'T-INV',
    tenantId: 'unauthorized_tenant_xyz',
    status: 'in_production'
  };

  await assert.rejects(
    async () => {
      await processTicket(invalidTicket, { allowAutonomousDeploy: true });
    },
    (err) => {
      assert.match(err.message, /Tenant desconhecido/);
      assert.match(err.message, /Fallback rejeitado por política de segurança/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// TESTE 12: fetchTickets Retorna Null sob Erro de Rede/API (P1-02)
// ---------------------------------------------------------------------------
await test('P1-02: fetchTickets retorna null em erro de API para não mascarar indisponibilidade como base vazia', async () => {
  const mockFetch500 = async () => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error'
  });

  const tickets = await fetchTickets({ fetch: mockFetch500, githubToken: 'mock_token' });
  assert.equal(tickets, null);
});

console.log('='.repeat(80));
console.log(`TOTAL DE TESTES: ${passed + failed} | APROVADOS: ${passed} | FALHAS: ${failed}`);
console.log('='.repeat(80));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 TODOS OS TESTES DA TERCEIRA AUDITORIA PASSARAM COM 100% DE SUCESSO!');
}
