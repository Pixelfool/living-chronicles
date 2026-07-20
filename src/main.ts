import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { buildSessionMiddleware, configureApp } from './bootstrap';
import { SessionIoAdapter } from './social/session-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const redisClient = configureApp(app);
  app.useWebSocketAdapter(
    new SessionIoAdapter(app, buildSessionMiddleware(redisClient)),
  );
  // Bare-bones demo console (public/index.html) for visualizing the API -
  // not the real player-facing client. Same-origin serving means cookies
  // and the CSRF token just work, no CORS configuration needed.
  app.useStaticAssets(join(process.cwd(), 'public'));
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
