-- Recipes imported from a pasted web link.
ALTER TYPE "RecipeSource" ADD VALUE 'WEB';
ALTER TABLE "Recipe" ADD COLUMN "sourceUrl" TEXT;
