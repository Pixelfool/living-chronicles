import { Request } from 'express';

/**
 * Regenerates the session ID, discarding whatever session (and data) came
 * in with the request. Must be called on every successful authentication
 * (register, login) before setting session.userId, to close the standard
 * session-fixation gap: without this, an attacker who gets a victim to
 * carry a known pre-auth session ID could end up sharing the victim's
 * post-login authenticated session.
 */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      resolve();
    });
  });
}
