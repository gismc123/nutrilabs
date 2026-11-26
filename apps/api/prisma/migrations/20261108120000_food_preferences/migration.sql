-- Free-text household taste profile the AI planner uses ("we like Mexican and grilling, no seafood").
ALTER TABLE "AppSettings" ADD COLUMN "foodPreferences" TEXT;
