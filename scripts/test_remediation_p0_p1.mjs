// scripts/test_remediation_p0_p1.mjs
// Suite de Testes Comportamentais com Mocks de Rede (GitHub, Vercel, CAS Concurrency)
// Atende integralmente às exigências da Segunda Auditoria Independente (Issue Comment 6405578956)

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

console.log('='.repeat(75));
console.log('SUITE DE TESTES COMPORTAMENTAIS: REMEDIAÇÃO P0/P1 HELPUS SUPPORT HUB');
console.log('='.repeat(75));

// ---------------------------------------------------------------------------
// TESTE 1: Preservação de Mensagens e Histórico Granular na Concorrência (P0-04)
// ---------------------------------------------------------------------------
await test('P0-04: Reconciliação granular preserva 100% das mensagens de escritores concorrentes', () => {
  const remoteTickets = [
    {
      id: 'AID-101',
      code: 'AID-101',
      title: 'Remoção texto do CRM dos depoimentos',
      tenantId: 'aidoctor',
      status: 'in_production',
      updatedAt: '2026-10-25T20:00:00.000Z',
      messages: [
        { id: 'm1', createdAt: '2026-10-25T20:01:00.000Z', senderId: 'cliente@helpus.com', content: 'Mensagem concorrente remota do cliente' }
      ]
    }
  ];

  const localTickets = [
    {
      id: 'AID-101',
      code: 'AID-101',
      title: 'Remoção texto do CRM dos depoimentos',
      tenantId: 'aidoctor',
      status: 'in_production',
      updatedAt: '2026-10-25T20:02:00.000Z',
      messages: [
        { id: 'm2', createdAt: '2026-10-25T20:02:00.000Z', senderId: 'agente@helpus.com', content: 'Mensagem concorrente local do agente' }
      ]
    }
  ];

  const merged = mergeTicketsGranular(remoteTickets, localTickets);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].messages.length, 2, 'Ambas as mensagens concorrentes devem ser preservadas');
  assert.equal(merged[0].messages[0].id, 'm1');
  assert.equal(merged[0].messages[1].id, 'm2');
});

// ---------------------------------------------------------------------------
// TESTE 2: CAS 409 Concurrency no saveTickets com Mock de Rede
// ---------------------------------------------------------------------------
await test('P0-02 & P0-04: saveTickets resolve conflito 409 via CAS, reconcilia e envia payload mesclado', async () => {
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
    // 1. GET do conteúdo para verificar SHA
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

    // 2. PUT do arquivo
    if (options.method === 'PUT') {
      putCount++;
      const body = JSON.parse(options.body);
      putPayloads.push(body);

      if (putCount === 1) {
        // Primeira tentativa colide em 409
        return {
          ok: false,
          status: 409,
          text: async () => 'Resource was modified by another writer (conflict)'
        };
      }

      // Segunda tentativa com SHA atualizado e dados mesclados
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: { sha: 'sha-final-333' } })
      };
    }

    return { ok: false, status: 500, text: async () => 'Not mapped' };
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
    githubToken: 'ghp_mock_token_for_testing_purposes_only'
  });

  assert.equal(result, true, 'saveTickets deve ter sucesso após reconciliação do 409');
  assert.equal(putCount, 2, 'Deve ter ocorrido 2 tentativas de PUT (1 com conflito 409, 1 com sucesso)');

  // Verificar que o segundo payload continha as mensagens mescladas
  const secondPutContent = JSON.parse(Buffer.from(putPayloads[1].content, 'base64').toString('utf-8'));
  assert.equal(secondPutContent[0].messages.length, 2, 'Payload do retry após 409 deve conter mensagens de ambos os escritores');
});

// ---------------------------------------------------------------------------
// TESTE 3: Verificação de Retorno de okHold (P1-01)
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
        // Primeira etapa (25% requisitos) passa
        return { ok: true, status: 200, json: async () => ({ content: { sha: 'sha-hold-2' } }) };
      }
      // Segunda etapa (okHold de espera por commit) falha
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

  assert.equal(result.success, false, 'Deve retornar false se a persistência da etapa de retenção okHold falhar');
  assert.equal(result.error, 'cloud_save_failed_at_hold', 'Deve indicar erro específico de retenção');
});

// ---------------------------------------------------------------------------
// TESTE 4: Verificador de Commit - Rejeição de SHA Não Existente (P0-01)
// ---------------------------------------------------------------------------
await test('P0-01: verifyCommit rejeita commit inexistente no GitHub e impede avanço do chamado', async () => {
  const mockFetchCommit404 = async (url) => {
    if (url.includes('/commits/deadbeef0000')) {
      return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const tenant = TENANTS.aidoctor;
  const verification = await verifyCommit(tenant, 'deadbeef0000', {
    fetch: mockFetchCommit404,
    githubToken: 'mock_token'
  });

  assert.equal(verification.valid, false, 'Commit inexistente deve ser inválido');
  assert.equal(verification.reason, 'commit_not_found_on_github_status_404');
});

// ---------------------------------------------------------------------------
// TESTE 5: Verificador de Commit - Aceitação de Commit Comprovado no Repositório
// ---------------------------------------------------------------------------
await test('P0-01: verifyCommit valida commit legítimo com proveniência comprovada no repositório', async () => {
  const legitimateSha = '0085ac474dd46d1f8cb0d8272250c233df6df349';
  const mockFetchCommit200 = async (url) => {
    if (url.includes(legitimateSha)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: legitimateSha,
          commit: { message: 'fix(remediation): correcao de bloqueios da auditoria' }
        })
      };
    }
    return { ok: false, status: 404 };
  };

  const tenant = TENANTS.aidoctor;
  const verification = await verifyCommit(tenant, legitimateSha, {
    fetch: mockFetchCommit200,
    githubToken: 'mock_token'
  });

  assert.equal(verification.valid, true, 'Commit comprovado deve ser válido');
  assert.equal(verification.fullSha, legitimateSha);
});

// ---------------------------------------------------------------------------
// TESTE 6: Verificador de Deployment - Rejeição de Spoof de Flag deploymentReady
// ---------------------------------------------------------------------------
await test('P0-01: verifyDeployment rejeita flags arbitrárias deploymentReady sem proveniência', async () => {
  const tenant = TENANTS.aidoctor;
  // Chamador envia deploymentReady: true sem deploymentId ou smoke test
  const verification = await verifyDeployment(tenant, { deploymentReady: true });
  assert.equal(verification.ready, false, 'Simples flag booleana deve ser rejeitada');
  assert.equal(verification.reason, 'unverified_deployment_provenance');
});

// ---------------------------------------------------------------------------
// TESTE 7: Verificador de Deployment - Deploy Hook 202 com Vercel FAILED não marca resolved
// ---------------------------------------------------------------------------
await test('P0-01: Deploy hook 202 com status FAILED na Vercel mantém chamado em homologação (75%)', async () => {
  const testTicket = {
    id: 'T-DEP-FAIL',
    code: 'T-DEP-FAIL',
    title: 'Teste Deploy Falho',
    tenantId: 'aidoctor',
    status: 'in_production',
    solutionCommitSha: '0085ac474dd46d1f8cb0d8272250c233df6df349'
  };

  const mockFetchFailedDeploy = async (url, options = {}) => {
    // 1. GET inicial
    if (!options.method || options.method === 'GET') {
      if (url.includes('/deployments/dpl_12345')) {
        // Vercel deployment API retorna status FAILED
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'dpl_12345', status: 'FAILED', readyState: 'ERROR' })
        };
      }
      if (url.includes('/commits/')) {
        return { ok: true, status: 200, json: async () => ({ sha: testTicket.solutionCommitSha }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'sha-curr',
          content: Buffer.from(JSON.stringify([testTicket])).toString('base64')
        })
      };
    }

    // 2. Deploy hook POST
    if (url.includes('deploy-hook') || options.method === 'POST') {
      return { ok: true, status: 202 }; // Hook aceitou o build
    }

    // 3. PUT tickets
    if (options.method === 'PUT') {
      return { ok: true, status: 200, json: async () => ({ content: { sha: 'sha-next' } }) };
    }

    return { ok: false, status: 500 };
  };

  const result = await processTicket(testTicket, {
    allowAutonomousDeploy: true,
    deployHook: 'https://api.vercel.com/v1/integrations/deploy/mock_hook_aidoctor',
    deploymentId: 'dpl_12345',
    vercelToken: 'mock_v_token'
  }, {
    fetch: mockFetchFailedDeploy,
    githubToken: 'mock_token'
  });

  assert.equal(result.success, true);
  assert.equal(result.step, 75, 'Não pode avançar para 100% se o deployment falhou');
  assert.equal(result.status, 'in_production', 'Deve ser retido em in_production');
});

// ---------------------------------------------------------------------------
// TESTE 8: Verificador de Deployment - Status READY comprovado conclui chamado (100%)
// ---------------------------------------------------------------------------
await test('P0-01: Deployment comprovado como READY na Vercel conclui chamado (100% / resolved)', async () => {
  const legitimateSha = '0085ac474dd46d1f8cb0d8272250c233df6df349';
  const testTicket = {
    id: 'T-DEP-OK',
    code: 'T-DEP-OK',
    title: 'Teste Deploy Concluído',
    tenantId: 'aidoctor',
    status: 'in_production',
    solutionCommitSha: legitimateSha
  };

  const mockFetchReadyDeploy = async (url, options = {}) => {
    if (!options.method || options.method === 'GET') {
      if (url.includes('/deployments/dpl_ready_999')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'dpl_ready_999',
            status: 'READY',
            readyState: 'READY',
            target: 'production',
            meta: { githubCommitSha: legitimateSha },
            url: 'https://aidoctor.helpusbr.com'
          })
        };
      }
      if (url.includes('/commits/')) {
        return { ok: true, status: 200, json: async () => ({ sha: legitimateSha }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'sha-curr',
          content: Buffer.from(JSON.stringify([testTicket])).toString('base64')
        })
      };
    }

    if (options.method === 'POST') {
      return { ok: true, status: 200 };
    }

    if (options.method === 'PUT') {
      return { ok: true, status: 200, json: async () => ({ content: { sha: 'sha-next' } }) };
    }

    return { ok: false, status: 500 };
  };

  const result = await processTicket(testTicket, {
    allowAutonomousDeploy: true,
    deployHook: 'https://api.vercel.com/v1/integrations/deploy/mock_hook_aidoctor',
    deploymentId: 'dpl_ready_999',
    vercelToken: 'mock_v_token',
    verifiedSha: legitimateSha
  }, {
    fetch: mockFetchReadyDeploy,
    githubToken: 'mock_token'
  });

  assert.equal(result.success, true);
  assert.equal(result.step, 100, 'Deve avançar para 100% com deployment comprovado READY');
  assert.equal(result.status, 'resolved', 'Status final deve ser resolved');
  assert.equal(result.deployment.ready, true);
});

// ---------------------------------------------------------------------------
// TESTE 9: Rejeição Estrita de Tenant Desconhecido (P1-01)
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
// TESTE 10: Tratamento de Falha de Rede no fetchTickets (P1-02)
// ---------------------------------------------------------------------------
await test('P1-02: fetchTickets retorna null em erro de API para não mascarar indisponibilidade como base vazia', async () => {
  const mockFetch500 = async () => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error'
  });

  const tickets = await fetchTickets({ fetch: mockFetch500, githubToken: 'mock_token' });
  assert.equal(tickets, null, 'Deve retornar null para evitar sobrescrita de banco');
});

console.log('='.repeat(75));
console.log(`TOTAL DE TESTES: ${passed + failed} | APROVADOS: ${passed} | FALHAS: ${failed}`);
console.log('='.repeat(75));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 TODOS OS TESTES COMPORTAMENTAIS PASSARAM COM 100% DE SUCESSO!');
}
