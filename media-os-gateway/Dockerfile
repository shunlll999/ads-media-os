FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY data ./data
COPY tests ./tests
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/main.js"]
