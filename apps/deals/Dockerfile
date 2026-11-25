# KrogerDeals: one image serving the API and the built web app.
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web ./
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
# prisma (dev dependency) stays installed: migrations run at start.
RUN npm install --no-audit --no-fund && npm cache clean --force
COPY server/prisma ./prisma
RUN npx prisma generate
COPY server/src ./src
COPY --from=web /web/dist ./public

USER node
EXPOSE 3101
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3102/internal/health >/dev/null || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
