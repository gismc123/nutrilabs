# Kroger data schema (observed 2026-11-25)

Two sources feed the app. Raw samples live in the gitignored `samples/` folder.

## 1. Digital coupons (internal API, read from inside the page)

`GET https://www.kroger.com/atlas/v1/savings-coupons/v2/coupons?projections=coupons.compact&filter.status=unclipped&filter.status=active&page.size=24&page.offset=N`

Response: `{ data: { coupons: [...] }, meta: { coupons: { ... } } }`.
`meta.coupons.page.hasMore` drives pagination. `meta.coupons.filterSummaryByType.totalCount`
is the total (394 on the sample day). `meta.coupons.filterSummaryByType.categories.options`
lists 31 departments as `{ id, name }`.

Role column: **ID** product or coupon identity, **AMT** discount amount, **TYPE** discount
type, **BRAND**, **CAT** category, **EXP** expiry, **CLIP** clip status, **LIMIT** usage limit.

| Field | Type | Example | Role | Notes |
|---|---|---|---|---|
| `id` | string | `"4259310"` | ID | Stable coupon id. Upsert key. |
| `offerId` | string (uuid) | `"a9c0a44a-..."` | ID | Unique per coupon. |
| `krogerCouponNumber` | string | `"800000274131"` | ID | Printed coupon number. |
| `flexRetailerCouponId` | string | `"4251361"` | | Shared by related coupons (74 distinct). |
| `brand` | string | `"Sabra"` | BRAND | 303 distinct. `"Other"` for store-wide offers. |
| `categories` | string[] | `["Deli"]` | CAT | One or more department names. |
| `title` | string | `"Save $3.00 on 2"` | TYPE | Headline. Its wording is the most reliable signal for discount type. |
| `shortDescription` | string | `"Save $3.00 on 2 Colgate"` | ID | Names the products. Main input for product matching. |
| `displayDescription` | string | same as short | | |
| `longDescription` | string | fine print | | |
| `requirementDescription` | string | `"Valid now through ..."` | | Full terms. |
| `value` | number | `3`, `2.49`, `20`, `500` | AMT | **Meaning depends on type**, see below. |
| `savings` | number | same as `value` | AMT | Equal to `value` in all 394 samples. |
| `requirementQuantity` | int | `2` | LIMIT | Items you must buy. 100 or 300 means dollars for SPEND offers. |
| `requirements` | `{ id, type, amount }[]` | `[{type:"QUANTITY",amount:2}]` | | Types seen: QUANTITY (393), SPEND (13), POINTS (1). |
| `redemptionsAllowed` | int | `1`, `5`, `-1` | LIMIT | Uses per household. `-1` means not limited by the coupon. |
| `displayStartDate` | ISO string | `"2026-11-17T00:00:00Z"` | | |
| `expirationDate` | ISO string | `"2026-12-15T23:59:59Z"` | EXP | Same as `displayEndDate`. |
| `addedToCard` | bool | `false` | CLIP | True when clipped to the signed-in card. Always false signed out. |
| `status` | string | `"unclipped"` | CLIP | |
| `canBeAddedToCard` | bool | `true` | CLIP | |
| `modalities` | string[] | `["PICKUP","IN_STORE","DELIVERY"]` | | 13 coupons lack IN_STORE: pickup or delivery only. |
| `specialSavings` | `{ name, displayName }[]` | `WDD`, `Expiring Soon`, `CL`, `5XEVENT` | TYPE | WDD = Weekly Digital Deal, CL = pickup or delivery only. |
| `clickListCoupon` | bool | `true` | | |
| `imageUrl` | string | softcoin.com URL | | Coupon art. |
| `type` | string | `"STANDARD"` | | Only value seen. |
| `popularitySortRank`, `relevanceSortRank`, `relativePopularityScore` | int | `39` | | Sort hints. |
| `enabled`, `projection`, `cashbackCashoutType`, `lastRedemptionDate`, `totalDownloads`, `isSharable`, `canBeRemoved`, `filterGroups` | misc | | | Not used. |

No field lists the UPCs a coupon applies to (the compact projection omits them). Coupon to
product links are therefore inferred by brand and description, with a confidence level.

### Discount types, derived from `title` and `value`

| Type | Title pattern | `value` means | Count |
|---|---|---|---|
| `AMOUNT_OFF` | `Save $1.00`, `Save 50¢`, `Save $3.00 on 2` | dollars off (per the required quantity) | ~300 |
| `FIXED_PRICE` | `$2.49`, `58¢/lb Kroger Frozen Turkey` | the final price (per lb when `/lb`) | ~45 |
| `PERCENT_OFF` | `Save 20%`, `Save 50% with Purchase` | percent | 10 |
| `BOGO` | `Buy 1, Get 1 Free` | 0 | 1 |
| `FREE_WITH_PURCHASE` | `Free with Purchase` | 0 | 1 |
| `POINTS` | `Get 4x POINTS`, `Get 500 POINTS` | fuel points or multiplier, **not dollars** | 7 |
| `SERVICE` | `Free Express Delivery`, Boost membership | not a grocery saving | 2 |

Treating `value` as savings for FIXED_PRICE or POINTS would invent large fake savings, so
the parser classifies first and only AMOUNT_OFF and PERCENT_OFF produce a dollar saving.

## 2. Official Kroger Products API (free developer account)

`GET https://api.kroger.com/v1/products?filter.term=milk&filter.locationId=02600585&filter.limit=50`
with a client-credentials token (scope `product.compact`). Location id is required for prices.

| Field | Type | Example | Notes |
|---|---|---|---|
| `upc` | string | `"0001111041700"` | Product key. |
| `productId` | string | same as upc | Product page `kroger.com/p/item/<productId>`. |
| `brand` | string | `"Kroger"` | Used for coupon matching. |
| `description` | string | `"Kroger® 2% Reduced Fat Milk Gallon"` | |
| `categories` | string[] | `["Dairy"]` | Same department names as coupons. |
| `images[].sizes[].url` | string | | Thumbnails. |
| `items[0].size` | string | `"1 gal"`, `"8 ct / 30.4 ounce"` | |
| `items[0].soldBy` | string | `"UNIT"` or `"WEIGHT"` | |
| `items[0].price.regular` | number | `7.99` | Shelf price. |
| `items[0].price.promo` | number, optional | `3.99` | **Sale price.** Present only when on sale. |
| `items[0].price.expirationDate.value` | ISO string | `"2026-12-02T04:59:59.999Z"` | Sale end date. `9999-12-31` when no sale. |
| `items[0].price.effectiveDate.value` | ISO string | | When the price took effect. |
| `items[0].nationalPrice` | object, optional | | Not returned for these items. |
| `items[0].inventory.stockLevel` | string, optional | `"HIGH"` | |
| `aisleLocations[]` | object[] | `{ description: "Aisle 12" }` | Shown in the aisle lookup. |

Samples on 2026-11-25 at Kroger Scottsville Road (02600585): Cheerios Giant Size regular
$7.99, promo $3.99 until Dec 2. Private Selection 80/20 ground beef $7.99, promo $5.99. Kroger
2% milk gallon $3.49, no promo. Daily limit on the free tier: 10,000 product calls.
