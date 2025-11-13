# Quote Calculator v3.0 - Production Dockerfile
# Multi-stage build для оптимизации размера и безопасности

ARG NODE_VERSION=18

# ============================================
# Base stage - общая база для dev и prod
# ============================================
FROM node:${NODE_VERSION}-alpine as base

# Metadata
LABEL maintainer="Quote Calculator Team"
LABEL version="3.0.0"
LABEL description="Quote Calculator with SQLite production deployment"

# Set working directory
WORKDIR /usr/src/app

# Install SQLite (needed for better-sqlite3)
RUN apk add --no-cache sqlite python3 make g++

# Expose port
EXPOSE 4000

# ============================================
# Dependencies stage - кэширование зависимостей
# ============================================
FROM base as deps

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production && \
    npm cache clean --force

# ============================================
# Development stage
# ============================================
FROM base as dev

# Install all dependencies including devDependencies
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# Create non-root user for development
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create directories with proper permissions
RUN mkdir -p db logs catalogs estimate backup settings && \
    chown -R nodejs:nodejs /usr/src/app

USER nodejs

# Copy application code
COPY --chown=nodejs:nodejs . .

# Environment
ENV NODE_ENV=development
ENV STORAGE_TYPE=sqlite
ENV LOG_LEVEL=debug
ENV LOG_CONSOLE=true

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server-with-db.js"]

# ============================================
# Production stage - минимальный образ
# ============================================
FROM base as prod

# Copy production dependencies from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Create non-root user for production
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create directories with proper permissions
RUN mkdir -p db logs catalogs estimate backup settings && \
    chown -R nodejs:nodejs /usr/src/app

USER nodejs

# Copy application code
COPY --chown=nodejs:nodejs . .

# Environment
ENV NODE_ENV=production
ENV STORAGE_TYPE=sqlite
ENV LOG_LEVEL=info
ENV LOG_CONSOLE=false

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "server-with-db.js"]
