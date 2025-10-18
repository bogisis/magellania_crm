FROM node:18-alpine

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install --production

# Копируем все файлы приложения
COPY . .

# Создаем необходимые директории
RUN mkdir -p catalog estimate backup

# Открываем порт
EXPOSE 3000

# Запускаем сервер
CMD ["node", "server.js"]
