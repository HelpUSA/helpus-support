import { NextRequest, NextResponse, after } from 'next/server';
import { ticketStore } from '@/lib/store';
import { aiAutoCodingWorker } from '@/lib/aiWorker';
import { getAutoResolutionDetails } from '@/lib/aiResolver';

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

    if (body.action === 'approve') {
      const updated = await ticketStore.startTicketProductionAsync(
        id,
        body.agentName || 'HelpUS Master',
        body.adminNotes,
        body.ticketData
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }

      // Ticket enters production status ('in_production') for local Antigravity Watcher execution
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'complete' || body.action === 'resolve') {
      const updated = ticketStore.completeTicketProduction(id, {
        success: true,
        solutionMessage: body.solutionMessage || '✨ Chamado concluído e solucionado com sucesso em produção.',
      });
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'reject') {
      if (!body.rejectionReason) {
        return NextResponse.json({ success: false, error: 'Motivo da recusa é obrigatório' }, { status: 400 });
      }
      const updated = ticketStore.rejectTicket(
        id,
        body.rejectionReason,
        body.agentName || 'HelpUS Master',
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
      const updated = ticketStore.editTicket(
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
      const updated = ticketStore.cancelTicket(
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
      const updated = ticketStore.updateTicketStatus(id, body.status, body.assignedTo);
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
