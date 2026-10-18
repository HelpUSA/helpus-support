import { NextRequest, NextResponse } from 'next/server';
import { loadControlCenterState, verifySuperAdminRequest } from '@/lib/helpusdevControlCenter';

export async function GET(req: NextRequest) {
  const headersObj: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  const auth = verifySuperAdminRequest(headersObj);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.httpStatus });
  }

  const state = loadControlCenterState();
  return NextResponse.json({
    ok: true,
    state_version: state.state_version,
    agents: Object.values(state.agents),
  });
}
