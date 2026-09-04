#!/bin/bash
set -e

echo "=== Build Docker image: pancake-server ==="
docker build -t pancake-server .

echo ""
echo "=== Xoa container cu (neu co) ==="
docker stop pancake-server 2>/dev/null || true
docker rm pancake-server 2>/dev/null || true

echo ""
echo "=== Chay container tren port 3105 ==="
docker run -d \
  --name pancake-server \
  -p 3105:3000 \
  -v pancake-server-data:/app/data \
  --restart unless-stopped \
  pancake-server

echo ""
echo "=== OK ==="
echo "Server chay tai: http://localhost:3105"
