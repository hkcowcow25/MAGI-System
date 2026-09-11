# MAGI System - Next.js production image for Synology / Docker
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
# package-lock.json is shipped as gzip+base64 parts (MCP size limits);
# reassemble then npm ci for reproducible installs including vitest.
COPY package-lock.json.gz.b64.part* ./
RUN set -eux; \
  if ls package-lock.json.gz.b64.part* >/dev/null 2>&1; then \
    cat package-lock.json.gz.b64.part* | base64 -d | gunzip > package-lock.json; \
    rm -f package-lock.json.gz.b64.part*; \
    npm ci; \
  else \
    echo "WARN: lock parts missing; falling back to npm install"; \
    npm install; \
  fi

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN rm -f package-lock.json.gz.b64 package-lock.json.gz.b64.part* \
  && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
