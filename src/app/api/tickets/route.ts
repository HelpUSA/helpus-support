import { NextRequest, NextResponse } from 'next/server';
import { ticketStore } from '@/lib/store';
import { validateServerApiAccess, projectTicketListForUser, projectTicketForUser } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ANTI_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
  'Pragma': 'no-cache',
  'Vary': 'Authorization, Cookie',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedTenant = searchParams.get('tenantId') || undefined;
  
  const auth = validateServerApiAccess(request.headers);

  // 1. Rejeição de solicitações não autenticadas (HTTP 401)
  if (!auth.authenticated) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: autenticação necessária para consultar chamados.' },
      { status: 401, headers: ANTI_CACHE_HEADERS }
    );
  }

  // 2. Isolamento Rígido Multi-Tenant:
  let effectiveTenant: string | undefined;

  if (auth.isSuperAdmin) {
    // SuperAdmin comprovado tem autorização para consultar 'all' ou tenant específico
    effectiveTenant = requestedTenant && requestedTenant !== 'all' ? requestedTenant : undefined;
  } else {
    // Usuários comuns ou administradores de cliente NUNCA podem consultar 'all'
    if (requestedTenant === 'all') {
      return NextResponse.json(
        { success: false, error: 'Acesso negado: visualização global de todos os chamados é restrita ao Administrador SuperAdmin.' },
        { status: 403, headers: ANTI_CACHE_HEADERS }
      );
    }

    // Se solicitar um tenant específico, deve pertencer à lista autorizada do usuário
    if (requestedTenant && requestedTenant !== auth.tenantId && (!auth.allowedTenantIds || !auth.allowedTenantIds.includes(requestedTenant))) {
      return NextResponse.json(
        { success: false, error: 'Acesso negado: você não possui permissão para consultar chamados de outro tenant.' },
        { status: 403, headers: ANTI_CACHE_HEADERS }
      );
    }

    effectiveTenant = requestedTenant || auth.tenantId || 'publicarte';
  }

  const tickets = await ticketStore.getTicketsAsync(effectiveTenant);
  const projected = projectTicketListForUser(tickets, auth.isSuperAdmin);

  return NextResponse.json(
    { success: true, version: 'v_2026_10_19_r26_sec', count: projected.length, data: projected },
    { status: 200, headers: ANTI_CACHE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateServerApiAccess(request.headers);

    // 1. Rejeição de solicitações não autenticadas (HTTP 401)
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: autenticação necessária para criar chamados.' },
        { status: 401, headers: ANTI_CACHE_HEADERS }
      );
    }

    const body = await request.json();
    delete body.events;
    if (body.ticketData) {
      delete body.ticketData.events;
    }
    const tenantHeader = request.headers.get('x-tenant-id');

    let tenantId = body.tenantId || tenantHeader || 'publicarte';
    let createdByEmail = body.createdByEmail || auth.userEmail;

    // 2. Proteção de Tenant na Criação:
    // Usuário não-SuperAdmin só pode criar chamados dentro do seu tenant autorizado
    if (!auth.isSuperAdmin) {
      if (body.tenantId && body.tenantId !== auth.tenantId && (!auth.allowedTenantIds || !auth.allowedTenantIds.includes(body.tenantId))) {
        return NextResponse.json(
          { success: false, error: 'Acesso negado: criação de chamados permitida apenas para o seu tenant autorizado.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
      tenantId = auth.tenantId || 'publicarte';
      if (auth.userEmail) {
        createdByEmail = auth.userEmail;
      }
    }

    if (!body.title || !body.description || !createdByEmail) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios ausentes: title, description, createdByEmail' },
        { status: 400, headers: ANTI_CACHE_HEADERS }
      );
    }

    const newTicket = await ticketStore.createTicketAsync({
      tenantId,
      title: body.title,
      description: body.description,
      category: body.category || 'support',
      priority: body.priority || 'medium',
      createdByEmail,
      createdByName: body.createdByName || (auth.userEmail ? auth.userEmail.split('@')[0] : createdByEmail.split('@')[0]),
      contextData: body.contextData,
      attachments: body.attachments,
      clientTicketCount: body.clientTicketCount,
    } as any);

    if (!newTicket) {
      return NextResponse.json(
        { success: false, error: 'Falha na persistência remota ao criar chamado na nuvem.' },
        { status: 500, headers: ANTI_CACHE_HEADERS }
      );
    }

    return NextResponse.json({ success: true, data: projectTicketForUser(newTicket, auth.isSuperAdmin) }, { status: 201, headers: ANTI_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Erro ao criar ticket' }, { status: 500, headers: ANTI_CACHE_HEADERS });
  }
}
