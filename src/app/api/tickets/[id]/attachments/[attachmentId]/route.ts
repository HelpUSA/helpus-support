import { NextResponse } from 'next/server';
import { ticketStore } from '@/lib/store';
import { validateServerApiAccess } from '@/lib/serverAuth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const auth = validateServerApiAccess(request.headers);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, attachmentId } = await params;
  const ticket = ticketStore.getTicketById(id);

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  // Multi-tenant isolation: SuperAdmins have global scope, client users only within their tenant
  if (!auth.isSuperAdmin && ticket.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: 'Forbidden: Access to attachment from another tenant denied' }, { status: 403 });
  }

  // Look for attachment in ticket root attachments or in messages
  let attachment = ticket.attachments?.find((a) => a.id === attachmentId);
  if (!attachment && ticket.messages) {
    for (const msg of ticket.messages) {
      if (msg.attachments) {
        attachment = msg.attachments.find((a) => a.id === attachmentId);
        if (attachment) {
          // If the message is an internal note and user is not superadmin, deny access
          if (msg.isInternalNote && !auth.isSuperAdmin) {
            return NextResponse.json({ error: 'Forbidden: Attachment belongs to an internal note' }, { status: 403 });
          }
          break;
        }
      }
    }
  }

  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: attachment.id,
    name: attachment.name,
    url: attachment.url,
    type: attachment.type,
    size: attachment.size,
  });
}
