import { NextRequest, NextResponse } from 'next/server';
import { ticketStore } from '@/lib/store';
import { validateServerApiAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedTenant = searchParams.get('tenantId') || undefined;
  
  const auth = validateServerApiAccess(request.headers);

  // Cross-Tenant Isolation Guard:
  // Non-SuperAdmin callers cannot query or view other tenants' tickets.
  let effectiveTenant = requestedTenant;
  if (!auth.isSuperAdmin && auth.authenticated && auth.tenantId && auth.tenantId !== 'all') {
    if (!requestedTenant || (auth.allowedTenantIds && !auth.allowedTenantIds.includes(requestedTenant))) {
      effectiveTenant = auth.tenantId;
    }
  }

  const tickets = await ticketStore.getTicketsAsync(effectiveTenant);
  return NextResponse.json({ success: true, version: 'v_2026_10_04_v2', count: tickets.length, data: tickets });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tenantHeader = request.headers.get('x-tenant-id');
    const tenantId = body.tenantId || tenantHeader || 'publicarte';

    if (!body.title || !body.description || !body.createdByEmail) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios ausentes: title, description, createdByEmail' },
        { status: 400 }
      );
    }

    const newTicket = await ticketStore.createTicketAsync({
      tenantId,
      title: body.title,
      description: body.description,
      category: body.category || 'support',
      priority: body.priority || 'medium',
      createdByEmail: body.createdByEmail,
      createdByName: body.createdByName || body.createdByEmail.split('@')[0],
      contextData: body.contextData,
      attachments: body.attachments,
      clientTicketCount: body.clientTicketCount,
    } as any);

    return NextResponse.json({ success: true, data: newTicket }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Erro ao criar ticket' }, { status: 500 });
  }
}
