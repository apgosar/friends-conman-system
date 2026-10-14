FROM node:20-slim AS base

# Install OpenSSL and Puppeteer dependencies (Chromium) in a single layer
RUN apt-get update && apt-get install -y \
    openssl \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libnss3 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# LibreOffice (Writer only) converts DOCX Demand Letters / Receipts to PDF before they are emailed or sent on WhatsApp
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-liberation \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Dependencies layer
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Builder layer
FROM base AS builder
WORKDIR /app
ENV BUILDING=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma Client
RUN npx prisma generate
RUN npm run build

# One-time data conversions. scripts/ and src/ are not shipped, so each conversion is bundled into
# one minified file under /app/data-migrations/. deploy/onprem/update.sh runs the ones a server has
# not run yet, in file-name order, once per server. To add one: write a script that is safe to repeat
# and safe on a database that never needed it, then add a line here with the next NNN- prefix.
# (esbuild comes with tsx, a devDependency.)
RUN mkdir -p data-migrations \
 && npx --no-install esbuild scripts/migrate-lifecycle-statuses.ts \
      --bundle --platform=node --target=node20 --format=cjs --packages=external \
      --tsconfig=tsconfig.json --minify --legal-comments=none \
      --outfile=data-migrations/001-lifecycle-statuses.js

# Runner layer — minimal production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security (CIS Docker Benchmark)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy necessary files
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/data-migrations ./data-migrations

# Switch to non-root user
USER nextjs

# Expose the port (Cloud Run standard)
EXPOSE 8080

# Health check — hits the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

# Start Next.js standalone server
CMD ["node", "server.js"]
