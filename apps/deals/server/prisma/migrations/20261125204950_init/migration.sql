-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "zip" TEXT,
    "locationId" TEXT,
    "nutrilabsUserId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "zip" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("locationId")
);

-- CreateTable
CREATE TABLE "products" (
    "upc" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "size" TEXT,
    "soldBy" TEXT,
    "category" TEXT,
    "categories" TEXT[],
    "imageUrl" TEXT,
    "aisle" TEXT,
    "raw" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("upc")
);

-- CreateTable
CREATE TABLE "prices" (
    "id" SERIAL NOT NULL,
    "upc" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "regular" DOUBLE PRECISION,
    "promo" DOUBLE PRECISION,
    "promoEnds" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_prices" (
    "upc" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "regular" DOUBLE PRECISION,
    "promo" DOUBLE PRECISION,
    "promoEnds" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_prices_pkey" PRIMARY KEY ("upc","locationId")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "offerId" TEXT,
    "couponNumber" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "terms" TEXT,
    "brand" TEXT,
    "categories" TEXT[],
    "discountType" TEXT NOT NULL,
    "amountOff" DOUBLE PRECISION,
    "percentOff" DOUBLE PRECISION,
    "fixedPrice" DOUBLE PRECISION,
    "perLb" BOOLEAN NOT NULL DEFAULT false,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "minSpend" DOUBLE PRECISION,
    "usageLimit" INTEGER,
    "pickupDeliveryOnly" BOOLEAN NOT NULL DEFAULT false,
    "weeklyDigitalDeal" BOOLEAN NOT NULL DEFAULT false,
    "specialSavings" TEXT[],
    "clipped" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "startDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'kroger-digital',
    "status" TEXT NOT NULL DEFAULT 'active',
    "matchStatus" TEXT NOT NULL DEFAULT 'pending',
    "searchedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_products" (
    "couponId" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("couponId","upc")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "signedIn" BOOLEAN,
    "counts" JSONB,
    "error" TEXT,
    "note" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_terms" (
    "term" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_terms_pkey" PRIMARY KEY ("term")
);

-- CreateTable
CREATE TABLE "product_searches" (
    "key" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "upcs" TEXT[],
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_searches_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "api_usage" (
    "day" TEXT NOT NULL,
    "products" INTEGER NOT NULL DEFAULT 0,
    "locations" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "api_usage_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "list_items" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "upc" TEXT,
    "couponId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION,
    "regular" DOUBLE PRECISION,
    "needsClip" BOOLEAN NOT NULL DEFAULT false,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "products_brand_idx" ON "products"("brand");

-- CreateIndex
CREATE INDEX "prices_upc_locationId_capturedAt_idx" ON "prices"("upc", "locationId", "capturedAt");

-- CreateIndex
CREATE INDEX "store_prices_locationId_promo_idx" ON "store_prices"("locationId", "promo");

-- CreateIndex
CREATE INDEX "coupons_status_expiryDate_idx" ON "coupons"("status", "expiryDate");

-- CreateIndex
CREATE INDEX "coupons_brand_idx" ON "coupons"("brand");

-- CreateIndex
CREATE INDEX "coupon_products_upc_idx" ON "coupon_products"("upc");

-- CreateIndex
CREATE INDEX "sync_runs_kind_startedAt_idx" ON "sync_runs"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "list_items_userId_idx" ON "list_items"("userId");

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_upc_fkey" FOREIGN KEY ("upc") REFERENCES "products"("upc") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stores"("locationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_prices" ADD CONSTRAINT "store_prices_upc_fkey" FOREIGN KEY ("upc") REFERENCES "products"("upc") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_prices" ADD CONSTRAINT "store_prices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stores"("locationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_upc_fkey" FOREIGN KEY ("upc") REFERENCES "products"("upc") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
