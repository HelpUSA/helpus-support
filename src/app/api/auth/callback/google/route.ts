import { NextResponse } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const hostOrigin = origin || 'https://support.helpusbr.com';
  const redirectUri = `${hostOrigin}/api/auth/callback/google`;

  if (error || !code) {
    return NextResponse.redirect(`${hostOrigin}/portal?error=google_auth_failed`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.id_token) {
      console.error('Google token exchange failed:', tokenData);
      return NextResponse.redirect(`${hostOrigin}/portal?error=google_token_failed`);
    }

    const base64Payload = tokenData.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = Buffer.from(base64Payload, 'base64').toString('utf-8');
    const userProfile = JSON.parse(payloadJson);

    const email = userProfile.email;
    const name = userProfile.name || email.split('@')[0];
    const picture = userProfile.picture || '';

    const portalUrl = new URL(`${hostOrigin}/portal`);
    portalUrl.searchParams.set('google_email', email);
    portalUrl.searchParams.set('google_name', name);
    if (picture) portalUrl.searchParams.set('google_picture', picture);

    return NextResponse.redirect(portalUrl.toString());
  } catch (err) {
    console.error('Error in Google Auth callback:', err);
    return NextResponse.redirect(`${hostOrigin}/portal?error=google_callback_exception`);
  }
}
