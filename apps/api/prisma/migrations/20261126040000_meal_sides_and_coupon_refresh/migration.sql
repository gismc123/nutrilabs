-- Sides for planned meals
CREATE TABLE "PlannedMealSide" (
    "id" SERIAL NOT NULL,
    "plannedMealId" INTEGER NOT NULL,
    "recipeId" INTEGER,
    "name" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlannedMealSide_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlannedMealSide_plannedMealId_idx" ON "PlannedMealSide"("plannedMealId");
CREATE INDEX "PlannedMealSide_recipeId_idx" ON "PlannedMealSide"("recipeId");
ALTER TABLE "PlannedMealSide" ADD CONSTRAINT "PlannedMealSide_plannedMealId_fkey" FOREIGN KEY ("plannedMealId") REFERENCES "PlannedMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannedMealSide" ADD CONSTRAINT "PlannedMealSide_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deals coupon refresh schedule
CREATE TABLE "deal_refresh_requests" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "requestedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "exitCode" INTEGER,
    "message" TEXT,
    CONSTRAINT "deal_refresh_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deal_refresh_requests_status_runAt_idx" ON "deal_refresh_requests"("status", "runAt");
CREATE INDEX "deal_refresh_requests_kind_runAt_idx" ON "deal_refresh_requests"("kind", "runAt");
