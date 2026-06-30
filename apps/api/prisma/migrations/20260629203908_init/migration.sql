-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "RecipeSource" AS ENUM ('USER', 'AI', 'SPOONACULAR');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "HouseholdMode" AS ENUM ('SOLO', 'DAD_MODE');

-- CreateEnum
CREATE TYPE "GroceryCategory" AS ENUM ('PRODUCE', 'PROTEIN', 'DAIRY', 'GRAINS', 'CANNED', 'FROZEN', 'MISC');

-- CreateEnum
CREATE TYPE "WeekStartDay" AS ENUM ('SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "avatarColor" TEXT NOT NULL,
    "isPlanner" BOOLEAN NOT NULL DEFAULT false,
    "dietaryNotes" TEXT,
    "foodDislikes" TEXT,
    "calorieTarget" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mealType" "MealType" NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "prepTimeMinutes" INTEGER,
    "costPerServing" DECIMAL(8,2),
    "calories" INTEGER,
    "proteinG" INTEGER,
    "carbsG" INTEGER,
    "fatG" INTEGER,
    "isKidFriendly" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[],
    "source" "RecipeSource" NOT NULL,
    "instructions" TEXT,
    "spoonacularId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayConfig" (
    "id" SERIAL NOT NULL,
    "mealPlanId" INTEGER NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "householdMode" "HouseholdMode" NOT NULL,
    "activeProfileIds" INTEGER[],

    CONSTRAINT "DayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedMeal" (
    "id" SERIAL NOT NULL,
    "mealPlanId" INTEGER NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "mealType" "MealType" NOT NULL,
    "recipeId" INTEGER,
    "eaten" BOOLEAN NOT NULL DEFAULT false,
    "eatenAt" TIMESTAMP(3),

    CONSTRAINT "PlannedMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryList" (
    "id" SERIAL NOT NULL,
    "mealPlanId" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedSpend" INTEGER,
    "loggedStore" TEXT,
    "loggedAt" TIMESTAMP(3),

    CONSTRAINT "GroceryList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryItem" (
    "id" SERIAL NOT NULL,
    "groceryListId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,
    "category" "GroceryCategory" NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "estimatedPriceWalmart" INTEGER,
    "estimatedPriceKroger" INTEGER,
    "estimatedPriceAldi" INTEGER,
    "isPantryStaple" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroceryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EatingOutLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "placeName" TEXT,
    "amount" INTEGER NOT NULL,
    "householdMode" "HouseholdMode" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EatingOutLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "weekStartDay" "WeekStartDay" NOT NULL DEFAULT 'SUN',
    "weeklyBudget" INTEGER NOT NULL DEFAULT 12000,
    "eatingOutReference" INTEGER NOT NULL DEFAULT 1200,
    "ollamaHost" TEXT NOT NULL DEFAULT 'http://192.168.1.190:11434',
    "ollamaModel" TEXT NOT NULL DEFAULT 'llama3',
    "krogerZip" TEXT,
    "spoonacularApiKey" TEXT,
    "usdaApiKey" TEXT,
    "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "currency" TEXT NOT NULL DEFAULT 'USD',

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyTemplate" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "householdMode" "HouseholdMode" NOT NULL,
    "isAlternatingWeek" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CustodyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryStaple" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryStaple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeImportCache" (
    "id" SERIAL NOT NULL,
    "spoonacularId" INTEGER NOT NULL,
    "rawJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeImportCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_spoonacularId_key" ON "Recipe"("spoonacularId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_userId_weekStartDate_key" ON "MealPlan"("userId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "DayConfig_mealPlanId_dayOfWeek_key" ON "DayConfig"("mealPlanId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedMeal_mealPlanId_dayOfWeek_mealType_key" ON "PlannedMeal"("mealPlanId", "dayOfWeek", "mealType");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryList_mealPlanId_key" ON "GroceryList"("mealPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_userId_key" ON "AppSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustodyTemplate_userId_dayOfWeek_isAlternatingWeek_key" ON "CustodyTemplate"("userId", "dayOfWeek", "isAlternatingWeek");

-- CreateIndex
CREATE UNIQUE INDEX "PantryStaple_userId_name_key" ON "PantryStaple"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeImportCache_spoonacularId_key" ON "RecipeImportCache"("spoonacularId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayConfig" ADD CONSTRAINT "DayConfig_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryList" ADD CONSTRAINT "GroceryList_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryItem" ADD CONSTRAINT "GroceryItem_groceryListId_fkey" FOREIGN KEY ("groceryListId") REFERENCES "GroceryList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EatingOutLog" ADD CONSTRAINT "EatingOutLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTemplate" ADD CONSTRAINT "CustodyTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryStaple" ADD CONSTRAINT "PantryStaple_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
