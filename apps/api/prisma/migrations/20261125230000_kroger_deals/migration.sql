-- KrogerDeals: Kroger sale prices and digital coupons (apps/api/src/deals). New tables only.
-- CreateTable
CREATE TABLE "deal_stores" (
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "zip" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_stores_pkey" PRIMARY KEY ("locationId")
);

-- CreateTable
CREATE TABLE "deal_products" (
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

    CONSTRAINT "deal_products_pkey" PRIMARY KEY ("upc")
);

-- CreateTable
CREATE TABLE "deal_prices" (
    "id" SERIAL NOT NULL,
    "upc" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "regular" DOUBLE PRECISION,
    "promo" DOUBLE PRECISION,
    "promoEnds" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "deal_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_store_prices" (
    "upc" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "regular" DOUBLE PRECISION,
    "promo" DOUBLE PRECISION,
    "promoEnds" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_store_prices_pkey" PRIMARY KEY ("upc","locationId")
);

-- CreateTable
CREATE TABLE "deal_coupons" (
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
    "sizeRefPrice" DOUBLE PRECISION,
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

    CONSTRAINT "deal_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_coupon_products" (
    "couponId" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "deal_coupon_products_pkey" PRIMARY KEY ("couponId","upc")
);

-- CreateTable
CREATE TABLE "deal_sync_runs" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "signedIn" BOOLEAN,
    "counts" JSONB,
    "error" TEXT,
    "note" TEXT,

    CONSTRAINT "deal_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_watch_terms" (
    "term" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_watch_terms_pkey" PRIMARY KEY ("term")
);

-- CreateTable
CREATE TABLE "deal_product_searches" (
    "key" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "upcs" TEXT[],
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_product_searches_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "deal_api_usage" (
    "day" TEXT NOT NULL,
    "products" INTEGER NOT NULL DEFAULT 0,
    "locations" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "deal_api_usage_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "deal_list_items" (
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

    CONSTRAINT "deal_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_products_brand_idx" ON "deal_products"("brand");

-- CreateIndex
CREATE INDEX "deal_prices_upc_locationId_capturedAt_idx" ON "deal_prices"("upc", "locationId", "capturedAt");

-- CreateIndex
CREATE INDEX "deal_store_prices_locationId_promo_idx" ON "deal_store_prices"("locationId", "promo");

-- CreateIndex
CREATE INDEX "deal_coupons_status_expiryDate_idx" ON "deal_coupons"("status", "expiryDate");

-- CreateIndex
CREATE INDEX "deal_coupons_brand_idx" ON "deal_coupons"("brand");

-- CreateIndex
CREATE INDEX "deal_coupon_products_upc_idx" ON "deal_coupon_products"("upc");

-- CreateIndex
CREATE INDEX "deal_sync_runs_kind_startedAt_idx" ON "deal_sync_runs"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "deal_list_items_userId_idx" ON "deal_list_items"("userId");

-- AddForeignKey
ALTER TABLE "deal_prices" ADD CONSTRAINT "deal_prices_upc_fkey" FOREIGN KEY ("upc") REFERENCES "deal_products"("upc") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_prices" ADD CONSTRAINT "deal_prices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "deal_stores"("locationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_store_prices" ADD CONSTRAINT "deal_store_prices_upc_fkey" FOREIGN KEY ("upc") REFERENCES "deal_products"("upc") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_store_prices" ADD CONSTRAINT "deal_store_prices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "deal_stores"("locationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_coupon_products" ADD CONSTRAINT "deal_coupon_products_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "deal_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_coupon_products" ADD CONSTRAINT "deal_coupon_products_upc_fkey" FOREIGN KEY ("upc") REFERENCES "deal_products"("upc") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_list_items" ADD CONSTRAINT "deal_list_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

