import { NextRequest, NextResponse } from 'next/server';
import { getControlCenterOverview, verifySuperAdminRequest } from '@/lib/helpusdevControlCenter';

export async function GET(req: NextRequest) {
  const headersObj: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  const auth = verifySuperAdminRequest(headersObj);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.httpStatus });
  }

  const overview = getControlCenterOverview();
  return NextResponse.json({ ok: true, overview });
}
