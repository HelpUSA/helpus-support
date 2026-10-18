import { NextRequest, NextResponse } from 'next/server';
import { verifySuperAdminRequest } from '@/lib/helpusdevControlCenter';

export async function GET(request: NextRequest) {
  const headersObj: Record<string, string | undefined> = {};
  request.headers.forEach((val, key) => {
    headersObj[key.toLowerCase()] = val;
  });

  const auth = verifySuperAdminRequest(headersObj);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.httpStatus });
  }

  try {
    const [artRes, patchRes, lockRes] = await Promise.all([
      fetch('http://127.0.0.1:8767/v1/artifacts?limit=50', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ ok: false, artifacts: [] })),
      fetch('http://127.0.0.1:8767/v1/hub/patches', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ ok: false, patches: [] })),
      fetch('http://127.0.0.1:8767/v1/hub/locks', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ ok: false, locks: [] })),
    ]);

    return NextResponse.json({
      ok: true,
      artifacts: artRes.artifacts || [],
      patches: patchRes.patches || [],
      locks: lockRes.locks || [],
      queried_at_utc: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'failed_querying_unified_hub' }, { status: 500 });
  }
}
