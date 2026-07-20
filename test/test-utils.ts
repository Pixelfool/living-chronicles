import request from 'supertest';

/**
 * Shared e2e helpers. Previously each spec file had its own slightly
 * different unique-id generator; consolidated here so there's one
 * length-safe implementation instead of three.
 */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function extractCookieValue(
  setCookieHeader: string[] | undefined,
  name: string,
): string | undefined {
  if (!setCookieHeader) {
    return undefined;
  }
  for (const raw of setCookieHeader) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (pair.slice(0, eq) === name) {
      return pair.slice(eq + 1);
    }
  }
  return undefined;
}

export function createAgent(server: Parameters<typeof request>[0]) {
  return request.agent(server);
}

export type TestAgent = ReturnType<typeof createAgent>;

/**
 * Issues a request through the agent (which then holds the CSRF cookie
 * for all subsequent requests on that agent) and returns the token value
 * to send back via the x-csrf-token header on mutating requests.
 */
export async function primeCsrfToken(agent: TestAgent): Promise<string> {
  const res = await agent.get('/health');
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const token = extractCookieValue(setCookie, 'lc.csrf');
  if (!token) {
    throw new Error('expected a CSRF cookie to be issued');
  }
  return token;
}

export interface RegisteredUser {
  userId: string;
  email: string;
  username: string;
}

/**
 * Registers a user through the given agent (which then holds the session
 * cookie for all subsequent requests on that agent). Register itself is
 * exempt from CSRF (no session exists yet), so no token is needed here.
 */
export async function registerUser(
  agent: TestAgent,
  emailPrefix: string,
): Promise<RegisteredUser> {
  const suffix = uniqueSuffix();
  const email = `${emailPrefix}-${suffix}@example.com`;
  const username = `${emailPrefix.replace(/[^a-zA-Z0-9]/g, '')}${suffix}`.slice(
    0,
    24,
  );

  const res = await agent
    .post('/auth/register')
    .send({ email, username, password: 'correct horse battery staple' })
    .expect(201);

  const body = res.body as { id: string };
  return { userId: body.id, email, username };
}
