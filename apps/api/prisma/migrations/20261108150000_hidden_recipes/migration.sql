-- Shared library recipes a user has removed from their own library view.
CREATE TABLE "HiddenRecipe" (
    "userId" INTEGER NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HiddenRecipe_pkey" PRIMARY KEY ("userId", "recipeId")
);
CREATE INDEX "HiddenRecipe_recipeId_idx" ON "HiddenRecipe"("recipeId");
ALTER TABLE "HiddenRecipe" ADD CONSTRAINT "HiddenRecipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiddenRecipe" ADD CONSTRAINT "HiddenRecipe_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
