# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Skip Electron binary download — not needed for Next.js build
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runner
FROM node:24-alpine AS runner

# Install host-interaction tools for session discovery
RUN apk add --no-cache git lsof procps

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2875
ENV HOSTNAME=0.0.0.0

# Copy the Next.js standalone bundle
COPY --from=builder /app/.next/standalone ./
# Static assets (JS chunks, CSS, images)
COPY --from=builder /app/.next/static ./.next/static
# Public directory
COPY --from=builder /app/public ./public

EXPOSE 2875

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:2875/api/sessions > /dev/null || exit 1

CMD ["node", "server.js"]
