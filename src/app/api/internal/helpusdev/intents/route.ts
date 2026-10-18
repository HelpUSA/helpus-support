import { NextRequest, NextResponse } from 'next/server';
import {
  loadControlCenterState,
  verifyDeviceRequest,
} from '@/lib/helpusdevControlCenter';

export async function GET(req: NextRequest) {
  const headersObj: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  const devAuth = verifyDeviceRequest(headersObj, '');
  if (!devAuth.ok) {
    return NextResponse.json({ ok: false, error: devAuth.error }, { status: devAuth.httpStatus });
  }

  const state = loadControlCenterState();
  const pending = state.intents.filter(
    (i) => i.status === 'submitted' && i.host_id === devAuth.hostId
  );

  return NextResponse.json({
    ok: true,
    state_version: state.state_version,
    intents: pending,
  });
}
