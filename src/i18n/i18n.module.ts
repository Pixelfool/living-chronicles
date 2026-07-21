import { Global, Module } from '@nestjs/common';
import { I18nService } from './i18n.service';

/**
 * Global, like PrismaModule/ConfigModule - localization is cross-cutting
 * infrastructure, not a bounded context with its own domain events
 * (architecture.md §4.12), so any module can inject I18nService without
 * an explicit import.
 */
@Global()
@Module({
  providers: [I18nService],
  exports: [I18nService],
})
export class I18nModule {}
