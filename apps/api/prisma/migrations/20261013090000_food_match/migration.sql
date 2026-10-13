-- CreateTable
CREATE TABLE "FoodMatch" (
    "key" TEXT NOT NULL,
    "fdcId" INTEGER,
    "description" TEXT,
    "dataType" TEXT,
    "calories" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "portions" JSONB NOT NULL DEFAULT '[]',
    "unitGrams" JSONB NOT NULL DEFAULT '{}',
    "skip" BOOLEAN NOT NULL DEFAULT false,
    "isUserChoice" BOOLEAN NOT NULL DEFAULT false,
    "matcherVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodMatch_pkey" PRIMARY KEY ("key")
);
