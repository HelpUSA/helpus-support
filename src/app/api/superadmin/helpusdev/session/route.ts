import { NextRequest, NextResponse } from 'next/server';
import { authenticateSuperAdminCredentials } from '@/lib/helpusdevControlCenter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || '');
    const credential = String(body.user_id || body.password || '');
    const tenantId = String(body.tenant_id || 'helpus-support');

    const res = authenticateSuperAdminCredentials(email, credential, tenantId);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus });
    }

    return NextResponse.json({
      ok: true,
      sessionToken: res.sessionToken,
      csrfToken: res.csrfToken,
      actor: {
        id: res.actor?.id,
        name: res.actor?.name,
        email: res.actor?.email,
        role: res.actor?.role,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'session_authentication_failed' },
      { status: 500 }
    );
  }
}
