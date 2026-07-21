import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentService } from '../content/content.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyProfessionXpGain,
  ProfessionXpGainResult,
} from './profession-leveling';

export interface ItemCraftedEvent {
  userId: string;
  characterId: string;
  recipeId: string;
  itemInstanceId: string;
  itemId: string;
}

export interface ProfessionLeveledUpEvent {
  userId: string;
  characterId: string;
  profession: string;
  newLevel: number;
}

export interface RecipeListEntry {
  id: string;
  name: string;
  minProfessionLevel: number;
  requiresDiscovery: boolean;
  available: boolean;
  durationSeconds: number;
  materials: { itemId: string; quantity: number }[];
  outputItemId: string;
  outputQuantity: number;
  blurb: string;
}

@Injectable()
export class CraftingService {
  private readonly logger = new Logger(CraftingService.name);

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

  listProfessions() {
    return this.content.getProfessions();
  }

  async chooseProfession(userId: string, professionId: string) {
    const character = await this.getOwnCharacter(userId);
    if (character.profession) {
      throw new ConflictException('you have already chosen a profession');
    }
    const profession = this.content.findProfession(professionId);
    if (!profession) {
      throw new NotFoundException('no such profession');
    }

    return this.prisma.character.update({
      where: { userId },
      data: { profession: professionId },
    });
  }

  async listRecipes(userId: string): Promise<RecipeListEntry[]> {
    await this.resolveDueJob(userId);
    const character = await this.getOwnCharacter(userId);
    if (!character.profession) {
      throw new BadRequestException('choose a profession first');
    }

    return this.content
      .getRecipesForProfession(character.profession)
      .map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        minProfessionLevel: recipe.minProfessionLevel,
        requiresDiscovery: recipe.requiresDiscovery,
        // No discovery-granting mechanic exists yet (M8 design discussion:
        // the field is here so a later milestone can wire one in without
        // touching this schema or check) - a discovery-gated recipe is
        // simply never available until then.
        available:
          !recipe.requiresDiscovery &&
          character.professionLevel >= recipe.minProfessionLevel,
        durationSeconds: recipe.durationSeconds,
        materials: recipe.materials,
        outputItemId: recipe.outputItemId,
        outputQuantity: recipe.outputQuantity,
        blurb: recipe.blurb,
      }));
  }

  async getStatus(userId: string) {
    await this.resolveDueJob(userId);
    const character = await this.getOwnCharacter(userId);

    const job = await this.prisma.craftingJob.findFirst({
      where: { characterId: character.id, status: 'IN_PROGRESS' },
    });
    if (!job) {
      return { inProgress: false as const };
    }

    return {
      inProgress: true as const,
      recipeId: job.recipeId,
      startedAt: job.startedAt,
      completesAt: job.completesAt,
      remainingSeconds: Math.max(
        0,
        Math.ceil((job.completesAt.getTime() - Date.now()) / 1000),
      ),
    };
  }

  async startCraft(userId: string, recipeId: string) {
    await this.resolveDueJob(userId);

    // Fast-fail pre-checks only - re-validated against a fresh read inside
    // the transaction below (same pattern as world.service.ts's travel()).
    const character = await this.getOwnCharacter(userId);
    if (!character.profession) {
      throw new BadRequestException('choose a profession first');
    }

    const recipe = this.content.findRecipe(recipeId);
    if (!recipe || recipe.professionId !== character.profession) {
      throw new NotFoundException('no such recipe for your profession');
    }
    if (recipe.requiresDiscovery) {
      throw new ForbiddenException('this recipe has not been discovered yet');
    }
    if (character.professionLevel < recipe.minProfessionLevel) {
      throw new ForbiddenException(
        `requires profession level ${recipe.minProfessionLevel}`,
      );
    }

    const existingJob = await this.prisma.craftingJob.findFirst({
      where: { characterId: character.id, status: 'IN_PROGRESS' },
    });
    if (existingJob) {
      throw new ConflictException('a craft is already in progress');
    }

    const job = await this.prisma.$transaction(async (tx) => {
      for (const material of recipe.materials) {
        const owned = await tx.itemInstance.findMany({
          where: { characterId: character.id, itemId: material.itemId },
          orderBy: { createdAt: 'asc' },
          take: material.quantity,
        });
        if (owned.length < material.quantity) {
          throw new BadRequestException(
            `not enough ${material.itemId} to craft this`,
          );
        }
        await tx.itemInstance.deleteMany({
          where: { id: { in: owned.map((instance) => instance.id) } },
        });
      }

      return tx.craftingJob.create({
        data: {
          characterId: character.id,
          recipeId: recipe.id,
          completesAt: new Date(Date.now() + recipe.durationSeconds * 1000),
        },
      });
    });

    return {
      recipeId: job.recipeId,
      startedAt: job.startedAt,
      completesAt: job.completesAt,
    };
  }

  /**
   * Lazy resolution (M8 design discussion): nothing polls CraftingJob rows.
   * Any crafting endpoint resolves a character's own due job first, so a
   * completed craft is granted the moment the player next interacts with
   * crafting - no background worker, per build-plan-v1.md §2/§4.
   */
  private async resolveDueJob(userId: string): Promise<void> {
    const character = await this.prisma.character.findUnique({
      where: { userId },
    });
    if (!character) {
      return;
    }

    const dueJob = await this.prisma.craftingJob.findFirst({
      where: {
        characterId: character.id,
        status: 'IN_PROGRESS',
        completesAt: { lte: new Date() },
      },
    });
    if (!dueJob) {
      return;
    }

    const recipe = this.content.findRecipe(dueJob.recipeId);

    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.craftingJob.updateMany({
        where: { id: dueJob.id, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', resolvedAt: new Date() },
      });
      if (count === 0 || !recipe) {
        // Already resolved by a concurrent request, or the recipe was
        // removed from content between start and completion - rare
        // enough to just log and move on rather than strand the job.
        return null;
      }

      // recipe.outputQuantity > 1 isn't exercised by any M8 content, but
      // creating each instance individually (rather than createMany, which
      // doesn't return the created rows) keeps that a trivial extension -
      // every instance created here is reported via its own ItemCrafted
      // event below.
      const createdInstances = [];
      for (let i = 0; i < recipe.outputQuantity; i += 1) {
        createdInstances.push(
          await tx.itemInstance.create({
            data: { characterId: character.id, itemId: recipe.outputItemId },
          }),
        );
      }

      const xpResult: ProfessionXpGainResult = applyProfessionXpGain(
        { level: character.professionLevel, xp: character.professionXp },
        recipe.professionXpReward,
      );
      await tx.character.update({
        where: { id: character.id },
        data: {
          professionLevel: xpResult.level,
          professionXp: xpResult.xp,
        },
      });

      return { createdInstances, xpResult };
    });

    if (!recipe) {
      this.logger.warn(
        `crafting job ${dueJob.id} completed but recipe "${dueJob.recipeId}" no longer exists in content - no output granted`,
      );
      return;
    }
    if (!result) {
      return;
    }

    for (const instance of result.createdInstances) {
      this.eventEmitter.emit('ItemCrafted', {
        userId,
        characterId: character.id,
        recipeId: dueJob.recipeId,
        itemInstanceId: instance.id,
        itemId: recipe.outputItemId,
      } satisfies ItemCraftedEvent);
    }

    if (result.xpResult.leveledUp && character.profession) {
      this.eventEmitter.emit('ProfessionLeveledUp', {
        userId,
        characterId: character.id,
        profession: character.profession,
        newLevel: result.xpResult.level,
      } satisfies ProfessionLeveledUpEvent);
    }
  }
}
