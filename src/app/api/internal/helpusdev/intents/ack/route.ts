import { NextRequest, NextResponse } from 'next/server';
import {
  ackAdminIntent,
  IntentStatus,
  verifyDeviceRequest,
} from '@/lib/helpusdevControlCenter';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headersObj: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  const devAuth = verifyDeviceRequest(headersObj, rawBody);
  if (!devAuth.ok) {
    return NextResponse.json({ ok: false, error: devAuth.error }, { status: devAuth.httpStatus });
  }

  const parsed = JSON.parse(rawBody);
  const intentId = String(parsed.intent_id || '');
  const targetStatus = (parsed.status || 'applied') as IntentStatus;
  const detail = String(parsed.detail || '');

  const res = ackAdminIntent(intentId, targetStatus, detail);
  return NextResponse.json(res, { status: res.httpStatus });
}
