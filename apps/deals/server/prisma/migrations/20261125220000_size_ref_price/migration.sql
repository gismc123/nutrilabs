-- Fixed-price deals: regular price of the smallest matched size, to avoid
-- applying a one-size deal price to bigger packs.
ALTER TABLE "coupons" ADD COLUMN "sizeRefPrice" DOUBLE PRECISION;
