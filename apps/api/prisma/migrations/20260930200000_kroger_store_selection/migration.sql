-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "krogerRadiusMiles" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "AppSettings" ADD COLUMN "krogerLocationId" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "krogerStoreName" TEXT;
