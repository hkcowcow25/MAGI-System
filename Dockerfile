# MAGI System - Next.js production image for Synology / Docker
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
# Lock file is optional: gzip+base64 parts may be absent or incomplete when
# pushed via MCP size limits. Prefer npm ci when a valid lock reassembles;
# otherwise fall back to npm install (sql.js etc. come from package.json).
COPY package-lock.json.gz.b64.part* ./
RUN set -eux; \
  if ls package-lock.json.gz.b64.part* >/dev/null 2>&1 \
    && cat package-lock.json.gz.b64.part* | base64 -d | gunzip > package-lock.json \
    && npm ci; then \
    rm -f package-lock.json.gz.b64.part*; \
  else \
    echo "WARN: lock parts missing/invalid; falling back to npm install"; \
    rm -f package-lock.json.gz.b64.part* package-lock.json; \
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
# Settings + history SQLite live under /data (compose volume MAGI_DATA_VOLUME)
ENV MAGI_DATA_DIR=/data

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data \
  && chown nextjs:nodejs /data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# sql.js is serverExternalPackages — copy into standalone image (ASM, no wasm/native).
COPY --from=builder /app/node_modules/sql.js ./node_modules/sql.js

USER nextjs
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
