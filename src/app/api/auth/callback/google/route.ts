import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { signSessionToken, isAuthorizedSuperAdminEmail } from '@/lib/serverAuth';
import { INITIAL_USERS } from '@/lib/auth';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '812202824664-s716306ibb7c15jh7aok2v0lfnuocpkn.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  const hostOrigin = origin || 'https://support.helpusbr.com';
  const redirectUri = `${hostOrigin}/api/auth/callback/google`;

  if (error || !code) {
    return NextResponse.redirect(`${hostOrigin}/portal?error=google_auth_failed`);
  }

  // State verification if state cookie was set
  const cookiesHeader = request.headers.get('cookie') || '';
  const stateCookieMatch = cookiesHeader.match(/helpus_oauth_state=([^;]+)/);
  const expectedState = stateCookieMatch ? decodeURIComponent(stateCookieMatch[1].trim()) : null;

  if (expectedState && state && state !== expectedState) {
    console.error('OAuth state mismatch rejected');
    return NextResponse.redirect(`${hostOrigin}/portal?error=oauth_state_mismatch`);
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

    // Cryptographic validation of Google id_token via Google tokeninfo endpoint
    // Google validates signature, issuer, audience and expiry
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`);
    if (!verifyRes.ok) {
      console.error('Cryptographic verification of Google id_token failed:', verifyRes.status);
      return NextResponse.redirect(`${hostOrigin}/portal?error=invalid_google_token_signature`);
    }

    const tokenInfo = await verifyRes.json();

    // Verify Audience (aud) matches our client ID
    if (GOOGLE_CLIENT_ID && tokenInfo.aud && tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      console.error('Google token audience mismatch:', tokenInfo.aud);
      return NextResponse.redirect(`${hostOrigin}/portal?error=invalid_token_audience`);
    }

    // Verify Issuer
    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (tokenInfo.iss && !validIssuers.includes(tokenInfo.iss)) {
      console.error('Google token issuer invalid:', tokenInfo.iss);
      return NextResponse.redirect(`${hostOrigin}/portal?error=invalid_token_issuer`);
    }

    // Verify Expiration
    const expSeconds = Number(tokenInfo.exp);
    if (!isNaN(expSeconds) && expSeconds * 1000 <= Date.now()) {
      console.error('Google token expired:', tokenInfo.exp);
      return NextResponse.redirect(`${hostOrigin}/portal?error=token_expired`);
    }

    const email = tokenInfo.email;
    if (!email) {
      return NextResponse.redirect(`${hostOrigin}/portal?error=no_email_in_token`);
    }

    const name = tokenInfo.name || email.split('@')[0];

    // Authoritative role assignment on the server
    const matchedUser = INITIAL_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
    const isSuperAdmin = isAuthorizedSuperAdminEmail(email);
    const role = isSuperAdmin ? 'super_admin' : (matchedUser?.role || 'client_user');
    const tenantId = isSuperAdmin ? 'all' : (matchedUser?.tenantId || (email.includes('@') ? email.split('@')[1].replace(/\./g, '-') : 'general'));

    // Issue cryptographically signed HMAC-SHA256 session token
    const sessionToken = signSessionToken({
      sub: email,
      email,
      name,
      role,
      tenantId,
    });

    const portalUrl = new URL(`${hostOrigin}/portal`);
    const response = NextResponse.redirect(portalUrl.toString());

    // Bind session to HttpOnly, SameSite, Secure cookie
    response.cookies.set('helpus_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600, // 7 days
      path: '/',
    });

    // Remove state cookie
    response.cookies.delete('helpus_oauth_state');

    return response;
  } catch (err) {
    console.error('Error in Google Auth callback:', err);
    return NextResponse.redirect(`${hostOrigin}/portal?error=google_callback_exception`);
  }
}
