import { NextRequest, NextResponse } from 'next/server';
import {
  IntentStatus,
  loadControlCenterState,
  redactSensitiveSummary,
  saveControlCenterState,
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
  const intentId = String(parsed.intent_id || '');
  const targetStatus = (parsed.status || 'applied') as IntentStatus;
  const detail = redactSensitiveSummary(String(parsed.detail || '')).clean;

  const found = state.intents.find((i) => i.intent_id === intentId);
  if (!found) {
    return NextResponse.json({ ok: false, error: 'intent_not_found' }, { status: 404 });
  }

  found.status = targetStatus;
  found.host_ack_detail = detail;
  found.acked_at_utc = new Date().toISOString();
  state.state_version += 1;
  saveControlCenterState(state);

  return NextResponse.json({
    ok: true,
    intent_id: found.intent_id,
    status: found.status,
    state_version: state.state_version,
  });
}
