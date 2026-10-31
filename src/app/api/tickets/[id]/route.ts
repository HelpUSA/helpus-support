import { NextRequest, NextResponse, after } from 'next/server';
import { ticketStore, INITIAL_TICKETS, fetchGitHubTickets } from '@/lib/store';
import { checkDurableApprovalSource } from '@/lib/approvalPersistence';
import { aiAutoCodingWorker } from '@/lib/aiWorker';
import { getAutoResolutionDetails } from '@/lib/aiResolver';
import { validateServerApiAccess, projectTicketForUser } from '@/lib/serverAuth';
import { AUTHORIZED_SUPERADMIN_EMAILS } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ANTI_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
  'Pragma': 'no-cache',
  'Vary': 'Authorization, Cookie',
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

  return NextResponse.json(
    { success: true, data: projectTicketForUser(ticket, auth.isSuperAdmin) },
    { status: 200, headers: ANTI_CACHE_HEADERS }
  );
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

    // Boundary defense: client requests cannot inject forged lifecycle events
    delete body.events;
    if (body.ticketData) {
      delete body.ticketData.events;
    }

    // Ensure tickets are fetched from GitHub database on serverless execution
    await ticketStore.getTicketsAsync();

    let existingTicket = ticketStore.getTicketById(id);
    if (!existingTicket && body.ticketData) {
      existingTicket = ticketStore.rehydrateTicket(body.ticketData);
    }
    if (!existingTicket) {
      return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
    }

    // 2. Verificação autoritativa de permissões do caller (Strict Server-Side Auth)
    // Apenas SuperAdmins comprovados via token assinado ou secret seguro têm privilégios administrativos.
    // Nenhum segredo fixo no body JSON é aceito.
    const isSuperAdminCaller = auth.isSuperAdmin;

    if (body.action === 'progress') {
      if (!isSuperAdminCaller && !auth.isServiceWorker) {
        return NextResponse.json(
          { success: false, error: 'Operação negada: Apenas o Administrador SuperAdmin ou Service Worker autorizado pode atualizar o progresso de execução.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }

      // Ordem 035: Restrição estrita de tenant e tarefa para service_worker
      if (auth.isServiceWorker && !auth.isSuperAdmin) {
        if (auth.allowedTasks && !auth.allowedTasks.includes('progress')) {
          return NextResponse.json(
            { success: false, error: `Acesso negado: Service Worker não possui autorização para a tarefa '${body.action}'.` },
            { status: 403, headers: ANTI_CACHE_HEADERS }
          );
        }
        const allowed = auth.allowedTenantIds || [];
        const isAllowedTenant = allowed.includes(existingTicket.tenantId);
        if (!isAllowedTenant) {
          return NextResponse.json(
            { success: false, error: `Acesso negado: Service Worker não possui escopo autorizado para o tenant '${existingTicket.tenantId}'.` },
            { status: 403, headers: ANTI_CACHE_HEADERS }
          );
        }
      }

      const pct = Number(body.percentage || 0);
      let updated;
      if (pct >= 100) {
        updated = await ticketStore.completeTicketProductionAsync(id, {
          success: true,
          solutionMessage: body.stepMessage || '✨ Chamado concluído e solucionado com sucesso em produção.',
        });
      } else {
        updated = await ticketStore.updateTicketProgress(
          id,
          pct,
          body.stepMessage || 'Executando tarefa no Antigravity...'
        );
      }
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'reset') {
      if (!isSuperAdminCaller) {
        return NextResponse.json(
          { success: false, error: 'Operação negada: Apenas o Administrador SuperAdmin pode reiniciar chamados.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
      const existing = ticketStore.getTicketById(id);
      if (!existing && !INITIAL_TICKETS.some(t => t.id === id || t.code === id)) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      const updated = await ticketStore.resetTicket(id, auth.userEmail);
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Falha na persistência remota ao reiniciar o chamado na nuvem.' },
          { status: 500, headers: ANTI_CACHE_HEADERS }
        );
      }
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'approve') {
      // Ordem 035: service_worker terminantemente bloqueado de aprovação Master
      if (auth.isServiceWorker) {
        return NextResponse.json(
          { success: false, error: 'Aprovação negada: service_worker não possui permissão de aprovação Master.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
      // Strict Server-Side Permission Check:
      // Only authenticated Master SuperAdmin with matching verified token can approve tickets.
      if (!isSuperAdminCaller) {
        return NextResponse.json(
          { success: false, error: 'Aprovação negada: Apenas o Administrador Master HelpUS autenticado pode autorizar chamados.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }

      // Prevent false Master approvals on seeded/client-cached tickets absent from shared storage.
      const canonicalTickets = await fetchGitHubTickets();
      const durableCheck = checkDurableApprovalSource(canonicalTickets, id, existingTicket.tenantId);
      if (!durableCheck.ok) {
        return NextResponse.json(
          { success: false, code: durableCheck.code, error: durableCheck.message, executionDispatched: false },
          { status: durableCheck.httpStatus, headers: ANTI_CACHE_HEADERS }
        );
      }

      const { ticket: updated, cloudSaveResult } = await ticketStore.startTicketProductionAsync(
        id,
        'HelpUS Master SuperAdmin',
        body.adminNotes,
        undefined, // approval must use server-owned record, never browser snapshot
        auth.userEmail
      );
      if (!updated) {
        if (cloudSaveResult && !cloudSaveResult.success) {
          return NextResponse.json(
            { success: false, error: `Falha na persistência remota ao autorizar chamado: ${cloudSaveResult.error}`, cloudSaveResult },
            { status: 500, headers: ANTI_CACHE_HEADERS }
          );
        }
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }

      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin), cloudSaveResult, executionDispatched: false }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'complete' || body.action === 'resolve') {
      const isAuthorizedOperator = isSuperAdminCaller || auth.isSuperAdmin || auth.userRole === 'agent';
      if (!isAuthorizedOperator) {
        return NextResponse.json(
          { success: false, error: 'Operação negada: Permissão de operador ou SuperAdmin necessária para concluir/resolver chamados.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
      const existing = ticketStore.getTicketById(id);
      if (!existing) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      const updated = await ticketStore.completeTicketProductionAsync(id, {
        success: true,
        solutionMessage: body.solutionMessage || '✨ Chamado concluído e solucionado com sucesso em produção.',
      });
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Falha na persistência remota ao concluir o chamado na nuvem.' },
          { status: 500, headers: ANTI_CACHE_HEADERS }
        );
      }
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
    }

    if (body.action === 'reject') {
      if (!isSuperAdminCaller) {
        return NextResponse.json(
          { success: false, error: 'Operação negada: Apenas o Administrador Master HelpUS pode recusar chamados.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
      if (!body.rejectionReason) {
        return NextResponse.json({ success: false, error: 'Motivo da recusa é obrigatório' }, { status: 400, headers: ANTI_CACHE_HEADERS });
      }
      const updated = await ticketStore.rejectTicketAsync(
        id,
        body.rejectionReason,
        'HelpUS Master SuperAdmin',
        body.ticketData,
        auth.userEmail
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
      }
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
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
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
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
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
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
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
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
        body.userName || (auth.userEmail ? auth.userEmail.split('@')[0] : 'Cliente'),
        auth.userEmail
      );
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Falha na persistência remota ao reabrir o chamado na nuvem.' },
          { status: 500, headers: ANTI_CACHE_HEADERS }
        );
      }
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
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
      return NextResponse.json({ success: true, data: projectTicketForUser(updated, auth.isSuperAdmin) }, { status: 200, headers: ANTI_CACHE_HEADERS });
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

    // Boundary defense: client requests cannot inject forged lifecycle events
    delete body.events;
    if (body.ticketData) {
      delete body.ticketData.events;
    }

    if (!body.content || (!body.senderId && !auth.userEmail)) {
      return NextResponse.json(
        { success: false, error: 'Campos senderId e content são obrigatórios' },
        { status: 400, headers: ANTI_CACHE_HEADERS }
      );
    }

    // TICK-01: Papel e nota interna determinados autoritativamente pelo servidor
    const senderRole = auth.isSuperAdmin
      ? (body.senderRole === 'system' ? 'system' : 'agent')
      : 'client';
    const isInternalNote = Boolean(body.isInternalNote && auth.isSuperAdmin);

    const message = await ticketStore.addMessageAsync(id, {
      senderId: auth.userEmail || auth.userId || 'client',
      senderName: auth.isSuperAdmin ? (body.senderName || 'Suporte HelpUS') : (auth.userEmail ? auth.userEmail.split('@')[0] : 'Cliente'),
      senderRole,
      isInternalNote,
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
