#!/bin/bash
# TheWord 部署脚本
# 使用方法: bash deploy.sh
# 当 SSH 提示密码时，请输入服务器密码

SERVER="root@8.134.124.64"
# 线上实际目录（PM2 的 the-word 应用也在此目录运行）
REMOTE_DIR="/data/the-word"
BUILD_DIR="D:/Test/Person/Word-app"

echo "=========================================="
echo "  TheWord 部署脚本"
echo "=========================================="

# 1. 确保 dist 已构建
echo "[1/5] 确保前端已构建..."
cd "$BUILD_DIR" || exit 1
if [ ! -d "dist" ]; then
  echo "  -> 正在构建前端..."
  npm run build
fi
echo "  -> 构建完成 ✅"

# 2. 在服务器上创建目录
echo "[2/5] 在服务器上创建目录..."
ssh -o StrictHostKeyChecking=no "$SERVER" "mkdir -p $REMOTE_DIR/server $REMOTE_DIR/data $REMOTE_DIR/dist" || {
  echo "  ❌ SSH 连接失败，请检查密码"
  exit 1
}
echo "  -> 目录创建完成 ✅"

# 2.5 备份线上数据库与旧代码（备份失败则终止，避免无备份部署）
echo "[2.5/5] 备份线上数据库..."
BACKUP_TS=$(date +%Y%m%d-%H%M%S)
ssh -o StrictHostKeyChecking=no "$SERVER" "set -e
  cp -a $REMOTE_DIR/data/word_app.db $REMOTE_DIR/data/word_app.db.bak-$BACKUP_TS
  cp -a $REMOTE_DIR/server/server.ts $REMOTE_DIR/server/server.ts.bak-$BACKUP_TS
  cp -a $REMOTE_DIR/dist $REMOTE_DIR/dist.bak-$BACKUP_TS" || {
  echo "  ❌ 备份失败，已终止部署"
  exit 1
}
echo "  -> 备份完成：$BACKUP_TS ✅"

# 3. 上传文件
echo "[3/5] 上传文件到服务器..."
echo "  -> 上传前端构建文件..."
scp -o StrictHostKeyChecking=no -r "$BUILD_DIR/dist/"* "$SERVER:$REMOTE_DIR/dist/"
echo "  -> 上传后端代码..."
scp -o StrictHostKeyChecking=no -r "$BUILD_DIR/server/"* "$SERVER:$REMOTE_DIR/server/"
echo "  -> 上传配置文件..."
scp -o StrictHostKeyChecking=no "$BUILD_DIR/package.json" "$SERVER:$REMOTE_DIR/"
scp -o StrictHostKeyChecking=no "$BUILD_DIR/package-lock.json" "$SERVER:$REMOTE_DIR/"
scp -o StrictHostKeyChecking=no "$BUILD_DIR/.env" "$SERVER:$REMOTE_DIR/"
echo "  -> 上传完成 ✅"

# 4. 在服务器上安装依赖并重启服务
echo "[4/5] 在服务器上安装依赖并重启服务..."
# tsx 位于 devDependencies（生产运行也依赖它），因此不能使用 --production
ssh -o StrictHostKeyChecking=no "$SERVER" "cd $REMOTE_DIR && npm install" || {
  echo "  ⚠️ npm install 失败，但继续尝试..."
}
# 必须用 PM2 重启：直接 kill 会被 PM2 自动拉起，造成端口冲突和反复重启
ssh -o StrictHostKeyChecking=no "$SERVER" "cd $REMOTE_DIR && pm2 restart the-word --update-env && pm2 save" || {
  echo "  ❌ PM2 重启失败，请登录服务器检查：pm2 list"
  exit 1
}

echo ""
echo "[5/5] 部署完成！验证服务..."
sleep 3

# 验证
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://8.134.124.64:3001/ 2>&1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ 服务运行正常 (HTTP $HTTP_CODE)"
else
  echo "  ⚠️ 服务状态: HTTP $HTTP_CODE，请检查"
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "  访问: http://8.134.124.64:3001/"
echo "=========================================="
