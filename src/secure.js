import { createRemoteJWKSet, jwtVerify } from 'jose';
import app from './index.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

let jwks;

function securityHeaders(headers) {
  const next = new Headers(headers);
  next.set('x-content-type-options', 'nosniff');
  next.set('x-frame-options', 'DENY');
  next.set('referrer-policy', 'no-referrer');
  next.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  next.set('cross-origin-opener-policy', 'same-origin');
  next.set('cross-origin-resource-policy', 'same-origin');
  return next;
}

async function verifyAccess(request, env) {
  if (env.DEV_ALLOW_UNAUTHENTICATED === 'true') return { type: 'user', id: 'local-dev' };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_POLICY_AUD || env.ACCESS_POLICY_AUD.startsWith('REPLACE_')) {
    throw new Error('Cloudflare Access verification is not configured');
  }
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new Error('Missing Cloudflare Access token');
  jwks ||= createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_POLICY_AUD,
  });
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (!email) throw new Error('Access token does not contain an email');
  return { type: 'user', id: email };
}

function writeRequestAllowed(request) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return true;
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin && origin !== url.origin) return false;
  if (fetchSite === 'cross-site') return false;
  return true;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const requestId = request.headers.get('cf-ray') || crypto.randomUUID();

    try {
      await verifyAccess(request, env);
    } catch (error) {
      console.error(JSON.stringify({ message: 'Access rejected', path: url.pathname, requestId, reason: error instanceof Error ? error.message : 'unknown' }));
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ ok: false, error: 'access-denied', message: 'Access could not be verified.', requestId }), {
          status: 401,
          headers: securityHeaders({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
        });
      }
      return new Response('Access denied', { status: 403, headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8' }) });
    }

    if (!writeRequestAllowed(request)) {
      return new Response(JSON.stringify({ ok: false, error: 'cross-origin-write-blocked', requestId }), {
        status: 403,
        headers: securityHeaders({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
      });
    }

    try {
      const response = await app.fetch(request, env, ctx);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: securityHeaders(response.headers),
      });
    } catch (error) {
      console.error(JSON.stringify({ message: 'Unhandled request error', path: url.pathname, requestId, error: error instanceof Error ? error.message : 'unknown' }));
      return json({ ok: false, error: 'request-failed', message: 'The request could not be completed.', requestId }, 500);
    }
  },
};
