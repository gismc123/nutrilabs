-- Admin flag; the first account (created by setup) becomes admin.
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isAdmin" = true WHERE id = (SELECT MIN(id) FROM "User");

-- Recipe ownership. Existing recipes stay shared (userId NULL).
ALTER TABLE "Recipe" ADD COLUMN "userId" INTEGER;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX IF EXISTS "Recipe_spoonacularId_key";
DROP INDEX IF EXISTS "Recipe_mealDbId_key";
CREATE UNIQUE INDEX "Recipe_userId_spoonacularId_key" ON "Recipe"("userId", "spoonacularId");
CREATE UNIQUE INDEX "Recipe_userId_mealDbId_key" ON "Recipe"("userId", "mealDbId");
CREATE INDEX "Recipe_userId_idx" ON "Recipe"("userId");

-- Reset tokens are stored hashed; outstanding plaintext tokens are discarded.
DELETE FROM "PasswordResetToken";
DROP INDEX IF EXISTS "PasswordResetToken_token_key";
ALTER TABLE "PasswordResetToken" DROP COLUMN "token";
ALTER TABLE "PasswordResetToken" ADD COLUMN "tokenHash" TEXT NOT NULL;
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- Food matches: shared automatic cache (userId 0) plus per-user corrections.
-- Existing corrections were made by the admin, so they move to the admin's rows.
ALTER TABLE "FoodMatch" ADD COLUMN "userId" INTEGER NOT NULL DEFAULT 0;
UPDATE "FoodMatch" SET "userId" = (SELECT MIN(id) FROM "User") WHERE "isUserChoice" = true;
ALTER TABLE "FoodMatch" DROP CONSTRAINT "FoodMatch_pkey";
ALTER TABLE "FoodMatch" ADD CONSTRAINT "FoodMatch_pkey" PRIMARY KEY ("key", "userId");
