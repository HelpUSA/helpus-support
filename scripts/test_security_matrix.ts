/**
 * HelpUS Support — Matriz de Testes de Segurança R26
 * Execução contra Handlers Reais do Next.js e Store
 *
 * Casos:
 * AUTH-01 .. AUTH-06
 * TICK-01 .. TICK-06
 * STORE-01 .. STORE-04
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { signSessionToken } from '../src/lib/serverAuth';
import { GET as getTicketsRoute, POST as postTicketsRoute } from '../src/app/api/tickets/route';
import { GET as getTicketByIdRoute, PATCH as patchTicketByIdRoute, POST as postMessageTicketRoute } from '../src/app/api/tickets/[id]/route';
import { GET as getAttachmentRoute } from '../src/app/api/tickets/[id]/attachments/[attachmentId]/route';
import { GET as getGoogleCallbackRoute } from '../src/app/api/auth/callback/google/route';
import { ticketStore, TicketStore } from '../src/lib/store';
import { Ticket } from '../src/types/ticket';

interface TestResult {
  id: string;
  name: string;
  handler: string;
  expected: string;
  actual: string;
  passed: boolean;
  details?: any;
}

const results: TestResult[] = [];

function recordResult(res: TestResult) {
  results.push(res);
  const statusIcon = res.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${statusIcon}] ${res.id}: ${res.name} -> Expected: ${res.expected} | Actual: ${res.actual}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('HELPUS SUPPORT — R26 MATRIZ DE SEGURANÇA (HANDLERS REAIS NEXT.JS)');
  console.log('================================================================\n');

  // Tokens sintéticos para teste
  const validSuperAdminToken = signSessionToken({
    userId: 'super-synthetic-1',
    email: 'helpus.ecommerce@gmail.com',
    role: 'super_admin',
    tenantId: 'all',
    allowedTenantIds: ['all'],
  });

  const validClientTenantAToken = signSessionToken({
    userId: 'client-tenant-a-1',
    email: 'user@tenant-a.com',
    role: 'client_admin',
    tenantId: 'tenant-a',
    allowedTenantIds: ['tenant-a'],
  });

  const validClientPublicarteToken = signSessionToken({
    userId: 'client-publicarte-1',
    email: 'contato@publicarte.com',
    role: 'client',
    tenantId: 'publicarte',
    allowedTenantIds: ['publicarte'],
  });

  // Seed isolated tickets for test assertions
  const testTicketPublicarte: Ticket = {
    id: 'tck-test-publicarte-001',
    tenantId: 'publicarte',
    tenantName: 'Public Arte Test',
    code: 'PUB-TEST-01',
    title: 'Ticket Teste Public Arte',
    description: 'Ticket para testes de segurança',
    category: 'support',
    priority: 'medium',
    status: 'pending_approval',
    createdByEmail: 'contato@publicarte.com',
    createdByName: 'Cliente Publicarte',
    adminNotes: 'NOTA_ADMIN_CONFIDENCIAL_SUPERADMIN_ONLY',
    messages: [
      {
        id: 'msg-pub-1',
        ticketId: 'tck-test-publicarte-001',
        senderId: 'contato@publicarte.com',
        senderName: 'Cliente Publicarte',
        senderRole: 'client',
        isInternalNote: false,
        content: 'Mensagem pública do cliente',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg-pub-internal',
        ticketId: 'tck-test-publicarte-001',
        senderId: 'agent@helpusbr.com',
        senderName: 'Atendente Master',
        senderRole: 'agent',
        isInternalNote: true,
        content: 'NOTA_INTERNA_CONFIDENCIAL_EQUIPE_TECNICA',
        createdAt: new Date().toISOString(),
      },
    ],
    attachments: [
      {
        id: 'att-pub-1',
        name: 'anexo_publicarte.png',
        url: 'https://cdn.helpusbr.com/att-pub-1.png',
        type: 'image/png',
        size: 1024,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testTicketNeuro: Ticket = {
    id: 'tck-test-neuro-002',
    tenantId: 'neuro.eduardomagalhaes',
    tenantName: 'Neuro Test',
    code: 'NEU-TEST-02',
    title: 'Ticket Teste Neuro',
    description: 'Dados médicos confidenciais neuro',
    category: 'support',
    priority: 'high',
    status: 'pending_approval',
    createdByEmail: 'eduardojcmagalhaes@gmail.com',
    createdByName: 'Dr Eduardo',
    attachments: [
      {
        id: 'att-neuro-secret-1',
        name: 'laudo_sigiloso.pdf',
        url: 'https://cdn.helpusbr.com/laudo.pdf',
        type: 'application/pdf',
        size: 2048,
      },
    ],
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Ensure these tickets are in store for testing
  (ticketStore as any).tickets = [
    testTicketPublicarte,
    testTicketNeuro,
    ...(ticketStore as any).tickets.filter((t: Ticket) => t.id !== testTicketPublicarte.id && t.id !== testTicketNeuro.id),
  ];

  // -------------------------------------------------------------
  // AUTH-01: Bearer arbitrário >= 32 chars
  // -------------------------------------------------------------
  try {
    const arbitraryBearer = 'A'.repeat(40);
    const req = new NextRequest('http://localhost:3012/api/tickets', {
      headers: {
        authorization: `Bearer ${arbitraryBearer}`,
      },
    });
    const res = await getTicketsRoute(req);
    const status = res.status;
    recordResult({
      id: 'AUTH-01',
      name: 'Bearer arbitrário >= 32 chars',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '401',
      actual: String(status),
      passed: status === 401,
    });
  } catch (err: any) {
    recordResult({
      id: 'AUTH-01',
      name: 'Bearer arbitrário >= 32 chars',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '401',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // AUTH-02: x-user-email + x-user-role falsificados
  // -------------------------------------------------------------
  try {
    const req = new NextRequest('http://localhost:3012/api/tickets', {
      headers: {
        'x-user-email': 'helpus.ecommerce@gmail.com',
        'x-user-role': 'super_admin',
        'x-tenant-id': 'all',
      },
    });
    const res = await getTicketsRoute(req);
    const status = res.status;
    recordResult({
      id: 'AUTH-02',
      name: 'x-user-email + x-user-role falsificados sem token assinado',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '401',
      actual: String(status),
      passed: status === 401,
    });
  } catch (err: any) {
    recordResult({
      id: 'AUTH-02',
      name: 'x-user-email + x-user-role falsificados sem token assinado',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '401',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // AUTH-03: x-tenant-id de outra empresa manipulado por usuário comum
  // -------------------------------------------------------------
  try {
    const req = new NextRequest('http://localhost:3012/api/tickets?tenantId=neuro.eduardomagalhaes', {
      headers: {
        authorization: `Bearer ${validClientPublicarteToken}`,
        'x-tenant-id': 'neuro.eduardomagalhaes',
      },
    });
    const res = await getTicketsRoute(req);
    const status = res.status;
    const body = await res.json();
    const tickets = body.data || [];
    const hasNeuroTickets = tickets.some((t: Ticket) => t.tenantId === 'neuro.eduardomagalhaes');
    const allArePublicarte = tickets.every((t: Ticket) => t.tenantId === 'publicarte');

    const passed = status === 403 || (status === 200 && !hasNeuroTickets && allArePublicarte);
    recordResult({
      id: 'AUTH-03',
      name: 'x-tenant-id de outra empresa manipulado por cliente',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '403 ou resposta restrita ao tenant autenticado',
      actual: `Status: ${status}, Neuro presente: ${hasNeuroTickets}, Restrito: ${allArePublicarte}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'AUTH-03',
      name: 'x-tenant-id de outra empresa manipulado por cliente',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: 'Restrito ao tenant autenticado',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // AUTH-04: Token expirado ou assinatura inválida
  // -------------------------------------------------------------
  try {
    // 1. Token com assinatura adulterada
    const tamperedToken = validClientPublicarteToken.slice(0, -6) + 'XXXXXX';
    const req1 = new NextRequest('http://localhost:3012/api/tickets', {
      headers: { authorization: `Bearer ${tamperedToken}` },
    });
    const res1 = await getTicketsRoute(req1);

    // 2. Token expirado
    const expiredToken = signSessionToken(
      {
        userId: 'expired-1',
        email: 'contato@publicarte.com',
        role: 'client',
        tenantId: 'publicarte',
        allowedTenantIds: ['publicarte'],
      },
      -3600 // Expirado há 1 hora
    );
    const req2 = new NextRequest('http://localhost:3012/api/tickets', {
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    const res2 = await getTicketsRoute(req2);

    const passed = res1.status === 401 && res2.status === 401;
    recordResult({
      id: 'AUTH-04',
      name: 'Token expirado / assinatura adulterada',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '401',
      actual: `Adulterado: ${res1.status}, Expirado: ${res2.status}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'AUTH-04',
      name: 'Token expirado / assinatura adulterada',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '401',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // AUTH-05: OAuth Google: state adulterado ou inválido
  // -------------------------------------------------------------
  try {
    const req = new NextRequest('http://localhost:3012/api/auth/callback/google?code=fake_code&state=forged_state', {
      headers: {
        cookie: 'helpus_oauth_state=legitimate_state_secret_123',
      },
    });
    const res = await getGoogleCallbackRoute(req);
    const location = res.headers.get('location') || '';
    const hasMismatchError = location.includes('error=oauth_state_mismatch');

    recordResult({
      id: 'AUTH-05',
      name: 'OAuth Google state adulterado',
      handler: 'src/app/api/auth/callback/google/route.ts (GET)',
      expected: 'Redirect com erro oauth_state_mismatch',
      actual: location,
      passed: hasMismatchError,
    });
  } catch (err: any) {
    recordResult({
      id: 'AUTH-05',
      name: 'OAuth Google state adulterado',
      handler: 'src/app/api/auth/callback/google/route.ts (GET)',
      expected: 'Rejeição',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // AUTH-06: Usuário válido com sessão assinada e escopo correto
  // -------------------------------------------------------------
  try {
    const req = new NextRequest('http://localhost:3012/api/tickets', {
      headers: { authorization: `Bearer ${validClientPublicarteToken}` },
    });
    const res = await getTicketsRoute(req);
    const body = await res.json();
    const passed = res.status === 200 && Array.isArray(body.data) && body.data.length > 0;
    recordResult({
      id: 'AUTH-06',
      name: 'Usuário válido com sessão assinada e escopo correto',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '200 com array de tickets autorizados',
      actual: `Status: ${res.status}, Count: ${body?.data?.length}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'AUTH-06',
      name: 'Usuário válido com sessão assinada e escopo correto',
      handler: 'src/app/api/tickets/route.ts (GET)',
      expected: '200',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // TICK-01: Cliente altera senderRole para 'agent' no corpo
  // -------------------------------------------------------------
  try {
    const req = new NextRequest(`http://localhost:3012/api/tickets/${testTicketPublicarte.id}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${validClientPublicarteToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Tentativa de enviar mensagem com papel agent falsificado',
        senderRole: 'agent',
      }),
    });
    const res = await postMessageTicketRoute(req, { params: Promise.resolve({ id: testTicketPublicarte.id }) });
    const body = await res.json();
    const createdMsg = body.data;
    const roleIsClient = createdMsg && createdMsg.senderRole === 'client';

    recordResult({
      id: 'TICK-01',
      name: 'Cliente altera senderRole para agent no body',
      handler: 'src/app/api/tickets/[id]/route.ts (POST)',
      expected: "senderRole forçado para 'client' pelo servidor",
      actual: `senderRole: ${createdMsg?.senderRole}`,
      passed: (res.status === 200 || res.status === 201) && roleIsClient,
    });
  } catch (err: any) {
    recordResult({
      id: 'TICK-01',
      name: 'Cliente altera senderRole para agent no body',
      handler: 'src/app/api/tickets/[id]/route.ts (POST)',
      expected: 'senderRole client',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // TICK-02: Cliente inclui secretToken e tenta chamar approve ou complete
  // -------------------------------------------------------------
  try {
    const req = new NextRequest(`http://localhost:3012/api/tickets/${testTicketPublicarte.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${validClientPublicarteToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'approve',
        secretToken: 'helpus_dev_master_authorized_local_token_v1',
      }),
    });
    const res = await patchTicketByIdRoute(req, { params: Promise.resolve({ id: testTicketPublicarte.id }) });

    // Tentar também action: 'complete'
    const reqComplete = new NextRequest(`http://localhost:3012/api/tickets/${testTicketPublicarte.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${validClientPublicarteToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'complete',
      }),
    });
    const resComplete = await patchTicketByIdRoute(reqComplete, { params: Promise.resolve({ id: testTicketPublicarte.id }) });

    const passed = res.status === 403 && resComplete.status === 403;
    recordResult({
      id: 'TICK-02',
      name: 'Cliente inclui secretToken / chama approve ou complete',
      handler: 'src/app/api/tickets/[id]/route.ts (PATCH)',
      expected: '403 em ambas as tentativas',
      actual: `Approve: ${res.status}, Complete: ${resComplete.status}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'TICK-02',
      name: 'Cliente inclui secretToken / chama approve ou complete',
      handler: 'src/app/api/tickets/[id]/route.ts (PATCH)',
      expected: '403',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // TICK-03: Cliente busca ticket de outro tenant por ID
  // -------------------------------------------------------------
  try {
    const req = new NextRequest(`http://localhost:3012/api/tickets/${testTicketNeuro.id}`, {
      headers: { authorization: `Bearer ${validClientPublicarteToken}` },
    });
    const res = await getTicketByIdRoute(req, { params: Promise.resolve({ id: testTicketNeuro.id }) });
    const passed = res.status === 403;
    recordResult({
      id: 'TICK-03',
      name: 'Cliente busca ticket de outro tenant por ID',
      handler: 'src/app/api/tickets/[id]/route.ts (GET)',
      expected: '403 Forbidden',
      actual: String(res.status),
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'TICK-03',
      name: 'Cliente busca ticket de outro tenant por ID',
      handler: 'src/app/api/tickets/[id]/route.ts (GET)',
      expected: '403',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // TICK-04: Cliente busca suas próprias mensagens (sem notas internas ou adminNotes)
  // -------------------------------------------------------------
  try {
    const req = new NextRequest(`http://localhost:3012/api/tickets/${testTicketPublicarte.id}`, {
      headers: { authorization: `Bearer ${validClientPublicarteToken}` },
    });
    const res = await getTicketByIdRoute(req, { params: Promise.resolve({ id: testTicketPublicarte.id }) });
    const body = await res.json();
    const data = body.data;

    const hasAdminNotes = data && typeof data.adminNotes !== 'undefined' && data.adminNotes !== null;
    const hasInternalMsg = data && data.messages && data.messages.some((m: any) => m.isInternalNote === true);

    const passed = res.status === 200 && !hasAdminNotes && !hasInternalMsg;
    recordResult({
      id: 'TICK-04',
      name: 'Cliente busca próprio ticket: filtragem de notas internas e adminNotes',
      handler: 'src/app/api/tickets/[id]/route.ts (GET)',
      expected: '200 sem adminNotes e sem mensagens isInternalNote',
      actual: `Status: ${res.status}, AdminNotes vazou: ${hasAdminNotes}, InternalNote vazou: ${hasInternalMsg}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'TICK-04',
      name: 'Cliente busca próprio ticket: filtragem de notas internas e adminNotes',
      handler: 'src/app/api/tickets/[id]/route.ts (GET)',
      expected: 'Filtragem server-side',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // TICK-05: Download direto de anexo privado de outro tenant
  // -------------------------------------------------------------
  try {
    const req = new NextRequest(
      `http://localhost:3012/api/tickets/${testTicketNeuro.id}/attachments/att-neuro-secret-1`,
      {
        headers: { authorization: `Bearer ${validClientPublicarteToken}` },
      }
    );
    const res = await getAttachmentRoute(req, {
      params: Promise.resolve({ id: testTicketNeuro.id, attachmentId: 'att-neuro-secret-1' }),
    });
    const passed = res.status === 403;
    recordResult({
      id: 'TICK-05',
      name: 'Download direto de anexo privado de outro tenant',
      handler: 'src/app/api/tickets/[id]/attachments/[attachmentId]/route.ts (GET)',
      expected: '403 Forbidden',
      actual: String(res.status),
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'TICK-05',
      name: 'Download direto de anexo privado de outro tenant',
      handler: 'src/app/api/tickets/[id]/attachments/[attachmentId]/route.ts (GET)',
      expected: '403 Forbidden',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // TICK-06: Operador autorizado resolve; cliente encerra/reabre
  // -------------------------------------------------------------
  try {
    // 1. SuperAdmin conclui/resolve
    const reqResolve = new NextRequest(`http://localhost:3012/api/tickets/${testTicketPublicarte.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${validSuperAdminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'resolve',
        solutionMessage: 'Solução testada pelo SuperAdmin',
      }),
    });
    const resResolve = await patchTicketByIdRoute(reqResolve, {
      params: Promise.resolve({ id: testTicketPublicarte.id }),
    });

    // 2. Cliente fecha/encerra
    const reqClose = new NextRequest(`http://localhost:3012/api/tickets/${testTicketPublicarte.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${validClientPublicarteToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'close',
        feedback: 'Tudo perfeito, obrigado!',
      }),
    });
    const resClose = await patchTicketByIdRoute(reqClose, {
      params: Promise.resolve({ id: testTicketPublicarte.id }),
    });

    // 3. Cliente reabre
    const reqReopen = new NextRequest(`http://localhost:3012/api/tickets/${testTicketPublicarte.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${validClientPublicarteToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'reopen',
        reason: 'Necessito de ajuste adicional na integração',
      }),
    });
    const resReopen = await patchTicketByIdRoute(reqReopen, {
      params: Promise.resolve({ id: testTicketPublicarte.id }),
    });

    const passed = resResolve.status === 200 && resClose.status === 200 && resReopen.status === 200;
    recordResult({
      id: 'TICK-06',
      name: 'Operador autorizado resolve; cliente encerra e reabre seu chamado',
      handler: 'src/app/api/tickets/[id]/route.ts (PATCH)',
      expected: '200 em todas as 3 transições autorizadas',
      actual: `Resolve: ${resResolve.status}, Close: ${resClose.status}, Reopen: ${resReopen.status}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'TICK-06',
      name: 'Operador autorizado resolve; cliente encerra e reabre seu chamado',
      handler: 'src/app/api/tickets/[id]/route.ts (PATCH)',
      expected: '200 em todas',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // STORE-01: JSON [] legitimamente vazio segue vazio (sem seed ou backup antigo)
  // -------------------------------------------------------------
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpus-test-store01-'));
    const testFile = path.join(tmpDir, 'test_tickets.json');
    const testBak = path.join(tmpDir, 'test_tickets.json.bak');

    // Cria JSON vazio propositalmente
    fs.writeFileSync(testFile, '[]', 'utf-8');

    // Instancia store isolada apontando para este arquivo
    const testStore = new TicketStore();
    (testStore as any).getStoragePath = () => testFile;
    (testStore as any).load();

    const tickets = testStore.getTickets();
    const passed = Array.isArray(tickets) && tickets.length === 0;

    // Limpeza
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    recordResult({
      id: 'STORE-01',
      name: 'JSON [] legitimamente vazio não aciona backup ou seed inicial',
      handler: 'src/lib/store.ts (TicketStore.load)',
      expected: 'tickets.length === 0',
      actual: `tickets.length = ${tickets.length}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'STORE-01',
      name: 'JSON [] legitimamente vazio não aciona backup ou seed inicial',
      handler: 'src/lib/store.ts (TicketStore.load)',
      expected: '0 tickets',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // STORE-02: Falha ao renomear/copiar propaga erro sem arquivo parcial
  // -------------------------------------------------------------
  try {
    const testStore = new TicketStore();
    // Aponta para caminho inválido em diretório inexistente sem permissão
    const invalidPath = process.platform === 'win32' ? 'Z:\\invalid_nonexistent_drive\\store.json' : '/nonexistent_dir/store.json';
    const success = (testStore as any).atomicSaveSync(invalidPath, []);

    recordResult({
      id: 'STORE-02',
      name: 'Falha de I/O na gravação atômica propaga erro e cancela operação',
      handler: 'src/lib/store.ts (TicketStore.atomicSaveSync)',
      expected: 'false (operação falhou de forma segura)',
      actual: String(success),
      passed: success === false,
    });
  } catch (err: any) {
    recordResult({
      id: 'STORE-02',
      name: 'Falha de I/O na gravação atômica propaga erro e cancela operação',
      handler: 'src/lib/store.ts (TicketStore.atomicSaveSync)',
      expected: 'false',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // STORE-03: Interrupção entre backup e commit: auto-recuperação do .bak
  // -------------------------------------------------------------
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpus-test-store03-'));
    const testFile = path.join(tmpDir, 'test_tickets.json');
    const testBak = path.join(tmpDir, 'test_tickets.json.bak');

    // Arquivo primário corrompido (JSON inválido)
    fs.writeFileSync(testFile, '{ CORRUPTED_INCOMPLETE_WRITE_DATA: [', 'utf-8');

    // Backup íntegro existente
    const backupData: Ticket[] = [testTicketPublicarte];
    fs.writeFileSync(testBak, JSON.stringify(backupData), 'utf-8');

    const testStore = new TicketStore();
    (testStore as any).getStoragePath = () => testFile;
    (testStore as any).load();

    const tickets = testStore.getTickets();
    const passed = Array.isArray(tickets) && tickets.length === 1 && tickets[0].id === testTicketPublicarte.id;

    // Limpeza
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    recordResult({
      id: 'STORE-03',
      name: 'Auto-recuperação determinística a partir de backup .bak quando primário corrompido',
      handler: 'src/lib/store.ts (TicketStore.load)',
      expected: '1 ticket recuperado do .bak com ID correto',
      actual: `Tickets recuperados: ${tickets.length}, ID: ${tickets[0]?.id}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'STORE-03',
      name: 'Auto-recuperação determinística a partir de backup .bak quando primário corrompido',
      handler: 'src/lib/store.ts (TicketStore.load)',
      expected: 'Recuperado',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // -------------------------------------------------------------
  // STORE-04: Concorrência entre escritas: mutex serializa sem lost updates
  // -------------------------------------------------------------
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpus-test-store04-'));
    const testFile = path.join(tmpDir, 'test_tickets.json');

    const testStore = new TicketStore();
    (testStore as any).getStoragePath = () => testFile;
    (testStore as any).tickets = [];

    // Dispara 20 escritas assíncronas concorrentes
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 20; i++) {
      const syntheticTicket: Ticket = {
        id: `tck-concurrent-${i}`,
        tenantId: 'publicarte',
        tenantName: 'Publicarte',
        code: `CONC-${i}`,
        title: `Chamado concorrente ${i}`,
        description: 'Teste de estresse de gravação simultânea',
        category: 'support',
        priority: 'low',
        status: 'pending_approval',
        createdByEmail: 'contato@publicarte.com',
        createdByName: 'Cliente Concorrente',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      (testStore as any).tickets.push(syntheticTicket);
      promises.push(testStore.saveAsync());
    }

    const saveResults = await Promise.all(promises);
    const allSuccessful = saveResults.every((r) => r.success === true);

    // Valida integridade do JSON salvo em disco
    const content = fs.readFileSync(testFile, 'utf-8');
    const parsed = JSON.parse(content);
    const passed = allSuccessful && Array.isArray(parsed) && parsed.length === 20;

    // Limpeza
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    recordResult({
      id: 'STORE-04',
      name: 'Concorrência de gravações serializada por mutex sem lost updates',
      handler: 'src/lib/store.ts (TicketStore.saveAsync)',
      expected: '20 gravações integradas sem perda de dados',
      actual: `Todos ok: ${allSuccessful}, Itens em disco: ${parsed?.length}`,
      passed,
    });
  } catch (err: any) {
    recordResult({
      id: 'STORE-04',
      name: 'Concorrência de gravações serializada por mutex sem lost updates',
      handler: 'src/lib/store.ts (TicketStore.saveAsync)',
      expected: '20 itens gravados',
      actual: `Error: ${err.message}`,
      passed: false,
    });
  }

  // Resumo final
  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = total - passedCount;

  console.log('\n================================================================');
  console.log(`RESULTADO DA MATRIZ DE SEGURANÇA: ${passedCount}/${total} APROVADOS (${failedCount} FALHAS)`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
