# Game server only (the website is deployed separately, e.g. on Vercel).
FROM oven/bun:1.4-slim
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts

COPY shared ./shared
COPY server ./server

ENV NODE_ENV=production
EXPOSE 4001
CMD ["bun", "server/index.ts"]
