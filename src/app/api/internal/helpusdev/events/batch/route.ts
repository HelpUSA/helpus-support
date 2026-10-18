import { NextRequest, NextResponse } from 'next/server';
import {
  ingestEventBatch,
  loadControlCenterState,
  verifyDeviceRequest,
} from '@/lib/helpusdevControlCenter';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headersObj: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  const state = loadControlCenterState();
  const devAuth = verifyDeviceRequest(headersObj, rawBody, state);
  if (!devAuth.ok) {
    return NextResponse.json({ ok: false, error: devAuth.error }, { status: devAuth.httpStatus });
  }

  const parsed = JSON.parse(rawBody);
  const res = ingestEventBatch(
    String(parsed.batch_id || ''),
    Array.isArray(parsed.events) ? parsed.events : [],
    Array.isArray(parsed.tasks) ? parsed.tasks : undefined
  );

  return NextResponse.json(res, { status: res.httpStatus });
}
