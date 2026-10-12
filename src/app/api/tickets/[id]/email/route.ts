import { NextRequest, NextResponse } from 'next/server';
import { ticketStore } from '@/lib/store';
import { emailService } from '@/lib/emailService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await ticketStore.getTicketsAsync();
    const ticket = ticketStore.getTicketById(id);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket não encontrado' }, { status: 404 });
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
