import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemAcquiredEvent } from '../inventory/inventory.service';
import { ContentService } from '../content/content.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

const SELL_PRICE_FRACTION = 0.5;

export interface ShopPurchaseEvent {
  userId: string;
  characterId: string;
  cityId: string;
  itemId: string;
  price: number;
}

export interface ShopSaleEvent {
  userId: string;
  characterId: string;
  itemInstanceId: string;
  itemId: string;
  price: number;
}

export interface ShopListingEntry {
  itemId: string;
  name: string;
  slot: string;
  price: number;
  attackBonus: number;
  defenseBonus: number;
  blurb: string;
}

@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async getOwnCharacter(userId: string) {
    const character = await this.prisma.character.findUnique({
      where: { userId },
    });
    if (!character) {
      throw new NotFoundException('no character on this account yet');
    }
    return character;
  }

  listShop(cityId: string): ShopListingEntry[] {
    const shop = this.content.getShop(cityId);
    if (!shop) {
      return [];
    }
    return shop.itemIds
      .map((itemId) => this.content.findItem(itemId))
      .filter((item) => item !== undefined)
      .map((item) => ({
        itemId: item.id,
        name: item.name,
        slot: item.slot,
        price: item.price,
        attackBonus: item.attackBonus,
        defenseBonus: item.defenseBonus,
        blurb: item.blurb,
      }));
  }

  async buy(userId: string, cityId: string, itemId: string) {
    const shop = this.content.getShop(cityId);
    if (!shop || !shop.itemIds.includes(itemId)) {
      throw new NotFoundException('that shop does not sell this item');
    }
    const item = this.content.findItem(itemId);
    if (!item) {
      throw new NotFoundException('item no longer exists in the content pack');
    }

    // Fast-fail pre-check only - re-validated against a fresh, locked read
    // inside the transaction below (same pattern as world.service.ts's
    // travel(), which is the earlier precedent for this idiom).
    await this.getOwnCharacter(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.character.updateMany({
        where: { userId, currentCityId: cityId, gold: { gte: item.price } },
        data: { gold: { decrement: item.price } },
      });
      if (count === 0) {
        throw new ConflictException(
          'not enough gold, or you have left the city',
        );
      }

      const character = await tx.character.findUniqueOrThrow({
        where: { userId },
      });
      const created = await tx.itemInstance.create({
        data: { characterId: character.id, itemId },
      });

      await this.auditLog.record(tx, 'ShopPurchase', userId, {
        cityId,
        itemId,
        price: item.price,
      });

      return { character, itemInstance: created };
    });

    this.eventEmitter.emit('ShopPurchase', {
      userId,
      characterId: result.character.id,
      cityId,
      itemId,
      price: item.price,
    } satisfies ShopPurchaseEvent);

    this.eventEmitter.emit('ItemAcquired', {
      userId,
      characterId: result.character.id,
      itemInstanceId: result.itemInstance.id,
      itemId,
    } satisfies ItemAcquiredEvent);

    return result;
  }

  async sell(userId: string, itemInstanceId: string) {
    const character = await this.getOwnCharacter(userId);

    const instance = await this.prisma.itemInstance.findUnique({
      where: { id: itemInstanceId },
    });
    if (!instance || instance.characterId !== character.id) {
      throw new NotFoundException('no such item');
    }
    const item = this.content.findItem(instance.itemId);
    const price = Math.floor((item?.price ?? 0) * SELL_PRICE_FRACTION);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.itemInstance.deleteMany({
        where: { id: itemInstanceId, characterId: character.id },
      });
      if (count === 0) {
        throw new NotFoundException('no such item');
      }

      await tx.character.update({
        where: { id: character.id },
        data: { gold: { increment: price } },
      });

      await this.auditLog.record(tx, 'ShopSale', userId, {
        itemInstanceId,
        itemId: instance.itemId,
        price,
      });
    });

    this.eventEmitter.emit('ShopSale', {
      userId,
      characterId: character.id,
      itemInstanceId,
      itemId: instance.itemId,
      price,
    } satisfies ShopSaleEvent);

    return { success: true, goldReceived: price };
  }
}
