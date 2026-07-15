FROM node:20-slim

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json ./

# 安装所有依赖（包括开发依赖，因为需要 tsx 运行服务端）
RUN npm install

# 复制所有源码
COPY . .

# 构建前端
RUN npm run build

# 端口
EXPOSE 3001

# 启动服务
ENV NODE_ENV=production
CMD node --import tsx server/server.ts
