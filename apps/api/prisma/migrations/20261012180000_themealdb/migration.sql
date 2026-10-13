-- AlterEnum
ALTER TYPE "RecipeSource" ADD VALUE 'THEMEALDB';

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "mealDbId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_mealDbId_key" ON "Recipe"("mealDbId");
