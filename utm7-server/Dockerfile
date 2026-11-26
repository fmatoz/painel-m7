FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY . .
USER node
EXPOSE 8080
CMD ["node", "index.mjs"]

