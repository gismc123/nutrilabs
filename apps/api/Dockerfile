FROM node:20-alpine

RUN apk add --no-cache openssl && npm install -g pnpm

WORKDIR /app

COPY package.json ./
RUN pnpm install

COPY prisma ./prisma
RUN pnpm exec prisma generate

COPY src ./src

EXPOSE 3001

CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
