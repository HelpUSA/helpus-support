import { NextResponse } from 'next/server';
import { ticketStore } from '@/lib/store';

export async function GET() {
  const tenants = ticketStore.getTenants();
  return NextResponse.json({ success: true, count: tenants.length, data: tenants });
}
