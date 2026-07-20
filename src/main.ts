import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  // Bare-bones demo console (public/index.html) for visualizing the API -
  // not the real player-facing client. Same-origin serving means cookies
  // and the CSRF token just work, no CORS configuration needed.
  app.useStaticAssets(join(process.cwd(), 'public'));
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
