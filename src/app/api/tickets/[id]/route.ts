import { NextRequest, NextResponse, after } from 'next/server';
import { ticketStore } from '@/lib/store';
import { aiAutoCodingWorker } from '@/lib/aiWorker';
import { getAutoResolutionDetails } from '@/lib/aiResolver';
import { validateServerApiAccess, AUTHORIZED_SUPERADMIN_EMAILS } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticket = ticketStore.getTicketById(id);

  if (!ticket) {
    return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: ticket });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Ensure tickets are fetched from GitHub database on serverless execution
    await ticketStore.getTicketsAsync();

    if (body.action === 'progress') {
      const updated = await ticketStore.updateTicketProgress(
        id,
        Number(body.percentage || 0),
        body.stepMessage || 'Executando tarefa no Antigravity...'
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'reset') {
      const updated = await ticketStore.resetTicket(id);
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    const auth = validateServerApiAccess(request.headers);
    const callerEmail = (body.agentEmail || body.userEmail || auth.userEmail || '').toLowerCase().trim();
    const isSuperAdminCaller = (AUTHORIZED_SUPERADMIN_EMAILS as readonly string[]).includes(callerEmail) && 
                               (auth.isSuperAdmin || request.headers.get('x-user-role') === 'super_admin' || body.secretToken === process.env.SUPERADMIN_SECRET);

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
      if (existing && existing.status !== 'pending_approval') {
        return NextResponse.json(
          { success: false, error: 'Não é possível editar um chamado que já foi concluído ou encerrado.' },
          { status: 400 }
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
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'cancel') {
      const existing = ticketStore.getTicketById(id) || body.ticketData;
      if (existing && existing.status !== 'pending_approval') {
        return NextResponse.json(
          { success: false, error: 'Não é possível excluir um chamado que já foi concluído ou encerrado.' },
          { status: 400 }
        );
      }
      if (!body.cancellationReason) {
        return NextResponse.json({ success: false, error: 'Motivo do cancelamento é obrigatório' }, { status: 400 });
      }
      const updated = await ticketStore.cancelTicketAsync(
        id,
        body.cancellationReason,
        body.cancelledByName || 'Cliente',
        body.ticketData
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.status) {
      const updated = await ticketStore.updateTicketStatusAsync(id, body.status, body.assignedTo);
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: 'Ação não especificada ou inválida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.stack || error?.message || error) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.content || !body.senderId) {
      return NextResponse.json(
        { success: false, error: 'Campos senderId e content são obrigatórios' },
        { status: 400 }
      );
    }

    const message = ticketStore.addMessage(id, {
      senderId: body.senderId,
      senderName: body.senderName || body.senderId,
      senderRole: body.senderRole || 'agent',
      isInternalNote: Boolean(body.isInternalNote),
      content: body.content,
      attachments: body.attachments,
    });

    if (!message) {
      return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
