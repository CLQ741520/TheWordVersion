FROM node:20-slim

WORKDIR /app

# 复制依赖并安装
COPY package.json package-lock.json ./
RUN npm install --loglevel verbose

# 复制源码
COPY . .

# 构建前端
RUN npx vite build

# 启动
EXPOSE 3001
ENV NODE_ENV=production
CMD npm start
