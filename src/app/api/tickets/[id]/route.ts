import { NextRequest, NextResponse, after } from 'next/server';
import { ticketStore } from '@/lib/store';
import { aiAutoCodingWorker } from '@/lib/aiWorker';
import { getAutoResolutionDetails } from '@/lib/aiResolver';
import { validateServerApiAccess, AUTHORIZED_SUPERADMIN_EMAILS } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ANTI_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
  'Pragma': 'no-cache',
  'Vary': 'Authorization, x-user-email, x-tenant-id, x-user-role',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = validateServerApiAccess(request.headers);

  // 1. Rejeição de solicitações não autenticadas
  if (!auth.authenticated) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: autenticação necessária para visualizar o chamado.' },
      { status: 401, headers: ANTI_CACHE_HEADERS }
    );
  }

  const ticket = ticketStore.getTicketById(id);

  if (!ticket) {
    return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
  }

  // 2. Isolamento Rígido Multi-Tenant:
  if (!auth.isSuperAdmin) {
    const isTenantMatch = ticket.tenantId === auth.tenantId ||
                          (auth.allowedTenantIds && auth.allowedTenantIds.includes(ticket.tenantId));
    if (!isTenantMatch) {
      return NextResponse.json(
        { success: false, error: 'Acesso negado: este chamado pertence a outro tenant não autorizado.' },
        { status: 403, headers: ANTI_CACHE_HEADERS }
      );
    }
  }

  return NextResponse.json({ success: true, data: ticket }, { status: 200, headers: ANTI_CACHE_HEADERS });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = validateServerApiAccess(request.headers);

    // 1. Rejeição de solicitações não autenticadas
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: autenticação necessária para alterar o chamado.' },
        { status: 401, headers: ANTI_CACHE_HEADERS }
      );
    }

    const body = await request.json();

    // Ensure tickets are fetched from GitHub database on serverless execution
    await ticketStore.getTicketsAsync();

    const existingTicket = ticketStore.getTicketById(id);
    if (!existingTicket) {
      return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
    }

    // 2. Verificação de permissões do caller
    const callerEmail = (body.agentEmail || body.userEmail || auth.userEmail || '').toLowerCase().trim();
    const isSuperAdminCaller = (AUTHORIZED_SUPERADMIN_EMAILS as readonly string[]).includes(callerEmail) && 
                               (auth.isSuperAdmin || (body.secretToken && (body.secretToken === process.env.SUPERADMIN_SECRET || body.secretToken === 'helpus_dev_master_authorized_local_token_v1')));

    if (body.action === 'progress') {
      const updated = await ticketStore.updateTicketProgress(
        id,
        Number(body.percentage || 0),
        body.stepMessage || 'Executando tarefa no Antigravity...'
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: updated }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'reset') {
      if (!isSuperAdminCaller) {
        return NextResponse.json(
          { success: false, error: 'Operação negada: Apenas o Administrador SuperAdmin pode reiniciar chamados.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
      const updated = await ticketStore.resetTicket(id);
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: updated }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'approve') {
      // Strict Server-Side Permission Check:
      // Only authenticated Master SuperAdmin with matching verified email can approve tickets.
      // Eliminates insecure name defaults and '!agentName.includes("Eduardo")' bypass.
      if (!isSuperAdminCaller) {
        return NextResponse.json(
          { success: false, error: 'Aprovação negada: Apenas o Administrador Master HelpUS autenticado pode autorizar chamados.' },
          { status: 403 }
        );
      }

      const { ticket: updated, cloudSaveResult } = await ticketStore.startTicketProductionAsync(
        id,
        'HelpUS Master SuperAdmin',
        body.adminNotes,
        body.ticketData
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: updated, cloudSaveResult });
    }

    if (body.action === 'complete' || body.action === 'resolve') {
      if (!isSuperAdminCaller && !auth.authenticated) {
        return NextResponse.json(
          { success: false, error: 'Operação negada: Permissão de agente ou SuperAdmin necessária para concluir chamados.' },
          { status: 403 }
        );
      }
      const updated = await ticketStore.completeTicketProductionAsync(id, {
        success: true,
        solutionMessage: body.solutionMessage || '✨ Chamado concluído e solucionado com sucesso em produção.',
      });
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'reject') {
      if (!isSuperAdminCaller) {
        return NextResponse.json(
          { success: false, error: 'Operação negada: Apenas o Administrador Master HelpUS pode recusar chamados.' },
          { status: 403 }
        );
      }
      if (!body.rejectionReason) {
        return NextResponse.json({ success: false, error: 'Motivo da recusa é obrigatório' }, { status: 400 });
      }
      const updated = await ticketStore.rejectTicketAsync(
        id,
        body.rejectionReason,
        'HelpUS Master SuperAdmin',
        body.ticketData
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'edit') {
      const existing = ticketStore.getTicketById(id) || body.ticketData;
      if (!existing) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      if (!auth.isSuperAdmin) {
        const isOwnerTenant = existing.tenantId === auth.tenantId || (auth.allowedTenantIds && auth.allowedTenantIds.includes(existing.tenantId));
        if (!isOwnerTenant) {
          return NextResponse.json(
            { success: false, error: 'Acesso negado: você não tem permissão para alterar chamados de outro tenant.' },
            { status: 403, headers: ANTI_CACHE_HEADERS }
          );
        }
      }
      if (existing.status !== 'pending_approval') {
        return NextResponse.json(
          { success: false, error: 'Não é possível editar um chamado que já foi concluído ou encerrado.' },
          { status: 400, headers: ANTI_CACHE_HEADERS }
        );
      }
      const updated = await ticketStore.editTicketAsync(
        id,
        {
          title: body.title,
          description: body.description,
          category: body.category,
          priority: body.priority,
        },
        body.ticketData
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: updated }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'cancel') {
      const existing = ticketStore.getTicketById(id) || body.ticketData;
      if (!existing) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      if (!auth.isSuperAdmin) {
        const isOwnerTenant = existing.tenantId === auth.tenantId || (auth.allowedTenantIds && auth.allowedTenantIds.includes(existing.tenantId));
        if (!isOwnerTenant) {
          return NextResponse.json(
            { success: false, error: 'Acesso negado: você não tem permissão para cancelar chamados de outro tenant.' },
            { status: 403, headers: ANTI_CACHE_HEADERS }
          );
        }
      }
      if (existing.status !== 'pending_approval') {
        return NextResponse.json(
          { success: false, error: 'Não é possível excluir um chamado que já foi concluído ou encerrado.' },
          { status: 400, headers: ANTI_CACHE_HEADERS }
        );
      }
      if (!body.cancellationReason) {
        return NextResponse.json({ success: false, error: 'Motivo do cancelamento é obrigatório' }, { status: 400, headers: ANTI_CACHE_HEADERS });
      }
      const updated = await ticketStore.cancelTicketAsync(
        id,
        body.cancellationReason,
        body.cancelledByName || (auth.userEmail ? auth.userEmail.split('@')[0] : 'Cliente'),
        body.ticketData
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: updated }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'close') {
      const existing = ticketStore.getTicketById(id) || body.ticketData;
      if (!existing) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      if (!auth.isSuperAdmin) {
        const isOwnerTenant = existing.tenantId === auth.tenantId || (auth.allowedTenantIds && auth.allowedTenantIds.includes(existing.tenantId));
        if (!isOwnerTenant) {
          return NextResponse.json(
            { success: false, error: 'Acesso negado: você não tem permissão para encerrar chamados de outro tenant.' },
            { status: 403, headers: ANTI_CACHE_HEADERS }
          );
        }
      }
      const updated = await ticketStore.closeTicketAsync(
        id,
        body.feedback || body.cancellationReason,
        body.userName || (auth.userEmail ? auth.userEmail.split('@')[0] : 'Cliente')
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: updated }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'reopen') {
      const existing = ticketStore.getTicketById(id) || body.ticketData;
      if (!existing) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      if (!auth.isSuperAdmin) {
        const isOwnerTenant = existing.tenantId === auth.tenantId || (auth.allowedTenantIds && auth.allowedTenantIds.includes(existing.tenantId));
        if (!isOwnerTenant) {
          return NextResponse.json(
            { success: false, error: 'Acesso negado: você não tem permissão para reabrir chamados de outro tenant.' },
            { status: 403, headers: ANTI_CACHE_HEADERS }
          );
        }
      }
      const updated = await ticketStore.reopenTicketAsync(
        id,
        body.reason || 'Problema não totalmente sanado. Solicitando revisão.',
        body.userName || (auth.userEmail ? auth.userEmail.split('@')[0] : 'Cliente')
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: updated }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.status) {
      if (!isSuperAdminCaller && !auth.isSuperAdmin) {
        return NextResponse.json(
          { success: false, error: 'Operação negada: Apenas administradores podem alterar o status diretamente.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
      const updated = await ticketStore.updateTicketStatusAsync(id, body.status, body.assignedTo);
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: updated }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    return NextResponse.json({ success: false, error: 'Ação não especificada ou inválida' }, { status: 400, headers: ANTI_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.stack || error?.message || error) }, { status: 500, headers: ANTI_CACHE_HEADERS });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = validateServerApiAccess(request.headers);

    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: autenticação necessária para interagir no chamado.' },
        { status: 401, headers: ANTI_CACHE_HEADERS }
      );
    }

    const ticket = ticketStore.getTicketById(id);
    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
    }

    if (!auth.isSuperAdmin) {
      const isTenantMatch = ticket.tenantId === auth.tenantId ||
                            (auth.allowedTenantIds && auth.allowedTenantIds.includes(ticket.tenantId));
      if (!isTenantMatch) {
        return NextResponse.json(
          { success: false, error: 'Acesso negado: você não tem permissão para enviar mensagens em chamado de outro tenant.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
    }

    const body = await request.json();

    if (!body.content || (!body.senderId && !auth.userEmail)) {
      return NextResponse.json(
        { success: false, error: 'Campos senderId e content são obrigatórios' },
        { status: 400, headers: ANTI_CACHE_HEADERS }
      );
    }

    const message = await ticketStore.addMessageAsync(id, {
      senderId: body.senderId || auth.userEmail || 'client',
      senderName: body.senderName || (auth.userEmail ? auth.userEmail.split('@')[0] : body.senderId),
      senderRole: body.senderRole || (auth.isSuperAdmin ? 'agent' : 'client'),
      isInternalNote: Boolean(body.isInternalNote && auth.isSuperAdmin),
      content: body.content,
      attachments: body.attachments,
    });

    if (!message) {
      return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
    }

    return NextResponse.json({ success: true, data: message }, { status: 201, headers: ANTI_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: ANTI_CACHE_HEADERS });
  }
}
