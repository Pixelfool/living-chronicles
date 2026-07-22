/**
 * The one place that knows how to talk to the backend: same-origin
 * fetch with cookies, plus the CSRF double-submit header on every
 * mutating request. Same mechanism public/index.html already uses
 * (getCookie + x-csrf-token), just typed and centralized so every
 * query/mutation reuses it instead of re-implementing it.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Nest's default exception filter shapes every error the same way
 * (statusCode/error/message), except message is a single string for
 * most exceptions and an array of strings for class-validator failures.
 * Flattening that here means every call site gets one clean message,
 * not two shapes to check.
 */
function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = body.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return fallback;
}

export async function apiFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie('lc.csrf');
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // empty or non-JSON body - leave data as null
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(data, `${method} ${path} failed (${response.status})`),
    );
  }

  return data as T;
}
