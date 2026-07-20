-- CreateIndex
CREATE INDEX "item_instances_characterId_idx" ON "item_instances"("characterId");

-- CreateIndex
CREATE INDEX "item_instances_characterId_equipped_idx" ON "item_instances"("characterId", "equipped");
