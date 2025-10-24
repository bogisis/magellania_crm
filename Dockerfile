# ========== Stage 1: Dependencies ==========
FROM node:18-alpine AS dependencies

WORKDIR /app

# Копируем только package files для кэширования
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# ========== Stage 2: Production ==========
FROM node:18-alpine AS production

# Метаданные
LABEL maintainer="quote-calculator"
LABEL version="2.3.0"

WORKDIR /app

# Копируем dependencies из предыдущего stage
COPY --from=dependencies /app/node_modules ./node_modules

# Копируем код приложения
COPY server.js .
COPY apiClient.js .
COPY errorBoundary.js .
COPY utils.js .
COPY version.js .
COPY index.html .
COPY package*.json .

# Создаём директории для данных
RUN mkdir -p catalog estimate backup && \
    chown -R node:node /app

# Non-root user для безопасности
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
