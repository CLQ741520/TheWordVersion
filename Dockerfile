# ===== 构建阶段 =====
FROM node:20-alpine AS builder

WORKDIR /app

# 先安装依赖（利用 Docker 缓存）
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码并构建
COPY . .
RUN npm run build

# ===== 运行阶段 =====
FROM node:20-alpine

WORKDIR /app

# 从构建阶段复制产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# 生产环境标志
ENV NODE_ENV=production

EXPOSE 3001

CMD ["npm", "start"]
