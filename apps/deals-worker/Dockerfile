# Coupon worker. Runs headed: the host passes its X display (Xwayland :0) in,
# because Kroger's edge blocks headless browsers. Started on demand by
# scripts/run-worker.sh, never as a long-running service.
FROM node:22-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev \
 && npx playwright install --with-deps chromium \
 && rm -rf /root/.npm /var/lib/apt/lists/*

COPY src ./src

# uid 1000 matches the desktop user, so the mounted profile and X auth file
# stay owned by them.
USER node
ENTRYPOINT ["node", "src/cli.js"]
