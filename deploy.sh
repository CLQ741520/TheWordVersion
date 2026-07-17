#!/bin/bash
# TheWord 部署脚本
# 使用方法: bash deploy.sh
# 当 SSH 提示密码时，请输入服务器密码

SERVER="root@8.134.124.64"
REMOTE_DIR="/root/Word-app"
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

# 4. 在服务器上安装依赖并启动
echo "[4/5] 在服务器上安装依赖并重启服务..."
ssh -o StrictHostKeyChecking=no "$SERVER" "cd $REMOTE_DIR && npm install --production" || {
  echo "  ⚠️ npm install 失败，但继续尝试..."
}
ssh -o StrictHostKeyChecking=no "$SERVER" "cd $REMOTE_DIR && cat > restart.sh << 'EOF'
#!/bin/bash
# 查找并杀掉现有进程
PID=\$(lsof -ti:3001 2>/dev/null)
if [ -n \"\$PID\" ]; then
  echo \"  停止旧进程: \$PID\"
  kill -9 \$PID 2>/dev/null
  sleep 1
fi

# 启动新进程
cd $REMOTE_DIR
nohup npx tsx server/server.ts > app.log 2>&1 &
echo \"  服务已启动: PID \$!\"
EOF
chmod +x restart.sh && bash restart.sh"

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
