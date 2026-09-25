# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runtime giữ nguyên node_modules đầy đủ (không prune dev deps) và src/ + data-source.ts vì
# `npm run migration:run` chạy qua `typeorm-ts-node-commonjs` (ts-node) trực tiếp trên TypeScript
# nguồn (data-source.ts: buildDataSourceOptions(__dirname + '/src', ...)) — không phải trên dist/.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json data-source.ts tsconfig.json tsconfig.build.json ./
COPY src ./src

EXPOSE 3000
# `wget` có sẵn trong Alpine (busybox) — dùng luôn GET /<API_PREFIX>/health thật của app, không cần
# cài thêm gói. API_PREFIX mặc định 'api/v1' nếu không truyền qua env lúc chạy container.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/${API_PREFIX:-api/v1}/health" || exit 1
# Migration KHÔNG chạy tự động ở đây có chủ đích — đây là bước riêng trong CD/runbook (xem
# release-checklist.md: "Chạy migration theo runbook"), không gắn vào entrypoint của container để
# tránh N container cùng chạy migration đồng thời khi scale nhiều instance.
CMD ["node", "dist/main"]
