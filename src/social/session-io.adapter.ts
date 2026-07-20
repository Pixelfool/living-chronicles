import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Server, ServerOptions } from 'socket.io';

/**
 * Authenticates Socket.IO handshakes with the same Redis-backed
 * express-session middleware the REST API uses (architecture.md §4.11) -
 * no separate WS auth scheme, just the same session cookie read off the
 * upgrade request. The fake `res` is never actually written to: it only
 * needs to exist long enough for the middleware to call `next()` after
 * loading the session from the store.
 *
 * Wired via `engine.use()` rather than `Server#use()`: the latter only
 * runs for the default `/` namespace, and the chat gateway lives on
 * `/chat` - engine-level middleware runs for every namespace's handshake.
 */
export class SessionIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly sessionMiddleware: RequestHandler,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.engine.use((req: unknown, res: unknown, next: NextFunction) => {
      this.sessionMiddleware(req as Request, res as Response, next);
    });
    return server;
  }
}
