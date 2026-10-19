import { NextResponse } from 'next/server';
import { validateServerApiAccess } from '@/lib/serverAuth';

export async function GET(request: Request) {
  const auth = validateServerApiAccess(request.headers);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: auth.user,
  });
}
