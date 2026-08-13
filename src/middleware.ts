import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PREFIXES = ['/sign-in', '/api/', '/_next/'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) || pathname.includes('.');
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Attach current URL so server layouts can read it for the ?next= redirect fallback
  const res = NextResponse.next();
  res.headers.set('x-url', req.url);

  const session = req.cookies.get('__vibe_session');
  if (!session?.value) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = '/sign-in';
    signInUrl.search = '';
    signInUrl.searchParams.set('next', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
