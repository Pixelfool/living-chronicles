import { randomBytes, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const CSRF_COOKIE_NAME = 'lc.csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Double-submit cookie CSRF protection (architecture.md §7: "SameSite +
 * double-submit"; SameSite alone was the only half implemented before
 * this). Scoped to requests that already carry an authenticated session:
 * register/login have no ambient session to forge yet, so they're
 * intentionally exempt - every authenticated mutating request (create
 * character, fight, logout, ...) is protected.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  let cookieToken = parseCookie(req.headers.cookie, CSRF_COOKIE_NAME);
  if (!cookieToken) {
    cookieToken = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, cookieToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  }

  const isAuthenticated = Boolean(req.session?.userId);
  const isMutating = MUTATING_METHODS.has(req.method);

  if (isAuthenticated && isMutating) {
    const headerToken = req.headers[CSRF_HEADER_NAME];
    if (
      typeof headerToken !== 'string' ||
      !safeEqual(headerToken, cookieToken)
    ) {
      res.status(403).json({
        statusCode: 403,
        error: 'Forbidden',
        message: 'missing or invalid CSRF token',
      });
      return;
    }
  }

  next();
}
