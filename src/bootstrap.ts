import { INestApplication, ValidationPipe } from '@nestjs/common';
import RedisStore from 'connect-redis';
import { RequestHandler } from 'express';
import session from 'express-session';
import Redis from 'ioredis';
import { csrfProtection } from './security/csrf';

/**
 * Builds the Redis-backed session middleware. Broken out from
 * configureApp so the WebSocket adapter (session-io.adapter.ts) can wire
 * up an independent instance pointed at the same store/secret - Socket.IO
 * handshakes authenticate off the exact same session cookie the REST API
 * uses, without a second auth scheme.
 */
export function buildSessionMiddleware(redisClient: Redis): RequestHandler {
  return session({
    store: new RedisStore({ client: redisClient, prefix: 'lc:sess:' }),
    name: 'lc.sid',
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });
}

/**
 * Shared app configuration (validation pipe, Redis-backed session cookie)
 * used by both the real bootstrap (main.ts) and e2e tests, so the two
 * never drift apart.
 */
export function configureApp(app: INestApplication): Redis {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const redisClient = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );

  app.use(buildSessionMiddleware(redisClient));
  app.use(csrfProtection);

  return redisClient;
}
