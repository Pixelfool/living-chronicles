import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentService } from '../content/content.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ItemAcquiredEvent {
  userId: string;
  characterId: string;
  itemInstanceId: string;
  itemId: string;
}

export interface ItemEquippedEvent {
  userId: string;
  characterId: string;
  itemInstanceId: string;
  itemId: string;
}

export interface InventoryEntry {
  id: string;
  itemId: string;
  equipped: boolean;
  name: string;
  slot: string | undefined;
  attackBonus: number;
  defenseBonus: number;
  blurb: string | undefined;
}

export interface EquipmentBonuses {
  attackBonus: number;
  defenseBonus: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
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

  private toEntry(instance: {
    id: string;
    itemId: string;
    equipped: boolean;
  }): InventoryEntry {
    const item = this.content.findItem(instance.itemId);
    return {
      id: instance.id,
      itemId: instance.itemId,
      equipped: instance.equipped,
      name: item?.name ?? instance.itemId,
      slot: item?.slot,
      attackBonus: item?.attackBonus ?? 0,
      defenseBonus: item?.defenseBonus ?? 0,
      blurb: item?.blurb,
    };
  }

  async listForCharacter(userId: string): Promise<InventoryEntry[]> {
    const character = await this.getOwnCharacter(userId);
    const instances = await this.prisma.itemInstance.findMany({
      where: { characterId: character.id },
      orderBy: { createdAt: 'asc' },
    });
    return instances.map((instance) => this.toEntry(instance));
  }

  /**
   * Sum of attack/defense bonuses from a set of already-fetched item
   * instances. Pure (no DB access) so Combat/World can call it with rows
   * read inside their own locked transaction, instead of this service
   * issuing a second, separately-timed query outside that lock.
   */
  sumEquipmentBonuses(instances: { itemId: string }[]): EquipmentBonuses {
    let attackBonus = 0;
    let defenseBonus = 0;
    for (const instance of instances) {
      const item = this.content.findItem(instance.itemId);
      if (item) {
        attackBonus += item.attackBonus;
        defenseBonus += item.defenseBonus;
      }
    }
    return { attackBonus, defenseBonus };
  }

  async equip(
    userId: string,
    itemInstanceId: string,
  ): Promise<InventoryEntry[]> {
    const character = await this.getOwnCharacter(userId);

    const instance = await this.prisma.itemInstance.findUnique({
      where: { id: itemInstanceId },
    });
    if (!instance || instance.characterId !== character.id) {
      throw new NotFoundException('no such item');
    }

    const item = this.content.findItem(instance.itemId);
    if (!item) {
      throw new NotFoundException('item no longer exists in the content pack');
    }

    const itemIdsInSlot = this.content
      .getItems()
      .filter((candidate) => candidate.slot === item.slot)
      .map((candidate) => candidate.id);

    await this.prisma.$transaction([
      this.prisma.itemInstance.updateMany({
        where: {
          characterId: character.id,
          itemId: { in: itemIdsInSlot },
          equipped: true,
        },
        data: { equipped: false },
      }),
      this.prisma.itemInstance.update({
        where: { id: itemInstanceId },
        data: { equipped: true },
      }),
    ]);

    this.eventEmitter.emit('ItemEquipped', {
      userId,
      characterId: character.id,
      itemInstanceId,
      itemId: instance.itemId,
    } satisfies ItemEquippedEvent);

    return this.listForCharacter(userId);
  }

  async unequip(
    userId: string,
    itemInstanceId: string,
  ): Promise<InventoryEntry[]> {
    const character = await this.getOwnCharacter(userId);

    const instance = await this.prisma.itemInstance.findUnique({
      where: { id: itemInstanceId },
    });
    if (!instance || instance.characterId !== character.id) {
      throw new NotFoundException('no such item');
    }

    await this.prisma.itemInstance.update({
      where: { id: itemInstanceId },
      data: { equipped: false },
    });

    return this.listForCharacter(userId);
  }
}
