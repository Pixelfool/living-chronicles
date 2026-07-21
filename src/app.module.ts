import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CharacterModule } from './character/character.module';
import { CombatModule } from './combat/combat.module';
import { ContentModule } from './content/content.module';
import { CraftingModule } from './crafting/crafting.module';
import { EconomyModule } from './economy/economy.module';
import { GuildsModule } from './guilds/guilds.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { PrismaModule } from './prisma/prisma.module';
import { SocialModule } from './social/social.module';
import { WorldModule } from './world/world.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    ContentModule,
    HealthModule,
    AuthModule,
    CharacterModule,
    InventoryModule,
    CombatModule,
    WorldModule,
    SocialModule,
    GuildsModule,
    EconomyModule,
    CraftingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
