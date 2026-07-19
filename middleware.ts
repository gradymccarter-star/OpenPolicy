import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RATE_LIMIT = 60; // requests per window
const WINDOW_MS = 60 * 1000; // 1 minute

const ipRequests = new Map<string, { count: number; resetTime: number }>();

// Clean up stale entries every 5 minutes
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  ipRequests.forEach((value, key) => {
    if (now > value.resetTime) {
      ipRequests.delete(key);
    }
  });
}

/**
 * Site-wide password gate (HTTP Basic Auth). Active only when SITE_PASSWORD is
 * set — local dev without the env var stays open. Username is ignored; share
 * just the password. Browsers cache the credential, so visitors are prompted once.
 */
function checkPassword(request: NextRequest): NextResponse | null {
  const password = process.env.SITE_PASSWORD;
  if (!password) return null;

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      if (decoded.slice(decoded.indexOf(':') + 1) === password) return null;
    } catch {
      // malformed header — fall through to the 401
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="PA Chamber Intelligence"' },
  });
}

export function middleware(request: NextRequest) {
  const denied = checkPassword(request);
  if (denied) return denied;

  cleanup();

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const now = Date.now();
  const entry = ipRequests.get(ip);

  if (!entry || now > entry.resetTime) {
    ipRequests.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', RATE_LIMIT.toString());
    response.headers.set('X-RateLimit-Remaining', (RATE_LIMIT - 1).toString());
    return response;
  }

  entry.count++;

  if (entry.count > RATE_LIMIT) {
    return new NextResponse(
      JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': RATE_LIMIT.toString(),
          'X-RateLimit-Remaining': '0',
          'Retry-After': Math.ceil((entry.resetTime - now) / 1000).toString(),
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', RATE_LIMIT.toString());
  response.headers.set(
    'X-RateLimit-Remaining',
    (RATE_LIMIT - entry.count).toString()
  );
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon\\.ico|images/|.*\\.(?:jpg|jpeg|png|svg|ico)$).*)',
  ],
};
