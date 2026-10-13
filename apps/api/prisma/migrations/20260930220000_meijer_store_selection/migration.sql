-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "meijerZip" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "meijerRadiusMiles" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "AppSettings" ADD COLUMN "meijerStoreId" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "meijerStoreName" TEXT;
