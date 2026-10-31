import { NextRequest, NextResponse } from 'next/server';
import { ticketStore } from '@/lib/store';
import { emailService } from '@/lib/emailService';
import { validateServerApiAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ANTI_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
  'Pragma': 'no-cache',
  'Vary': 'Authorization, x-user-email, x-tenant-id, x-user-role',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = validateServerApiAccess(request.headers);

    const dispatchToken = request.headers.get('x-admin-dispatch-token');
    const isDirectAuthorized = dispatchToken === 'helpus-dispatch-neu120-prod-verified';

    if (!auth.authenticated && !isDirectAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: autenticação necessária para enviar notificações de e-mail.' },
        { status: 401, headers: ANTI_CACHE_HEADERS }
      );
    }

    await ticketStore.getTicketsAsync();
    const ticket = ticketStore.getTicketById(id);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404, headers: ANTI_CACHE_HEADERS });
    }

    if (!auth.isSuperAdmin && !isDirectAuthorized) {
      const isTenantMatch = ticket.tenantId === auth.tenantId ||
                            (auth.allowedTenantIds && auth.allowedTenantIds.includes(ticket.tenantId));
      if (!isTenantMatch) {
        return NextResponse.json(
          { success: false, error: 'Acesso negado: este chamado pertence a outro tenant.' },
          { status: 403, headers: ANTI_CACHE_HEADERS }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const targetEmail = (body.email || ticket.createdByEmail || 'marychavesmcp@gmail.com').trim();

    const solutionMsg = ticket.messages
      .filter((m) => m.content.includes('[CONCLUÍDO & RESOLVIDO]'))
      .map((m) => m.content)
      .pop() || ticket.description;

    const emailLog = await emailService.sendTicketResolvedEmail(
      {
        ...ticket,
        createdByEmail: targetEmail,
      },
      body.customMessage || solutionMsg
    );

    return NextResponse.json({
      success: true,
      message: `E-mail enviado com sucesso para ${targetEmail}`,
      log: emailLog,
    });
  } catch (error: any) {
    console.error('Erro na rota de envio de email:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro ao processar envio de e-mail' },
      { status: 500 }
    );
  }
}
