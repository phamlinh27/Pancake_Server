@echo off
echo === Build Docker image: pancake-server ===
docker build -t pancake-server .

if %ERRORLEVEL% NEQ 0 (
    echo Build FAILED
    pause
    exit /b 1
)

echo.
echo === Xoa container cu (neu co) ===
docker stop pancake-server 2>nul
docker rm pancake-server 2>nul

echo.
echo === Chay container tren port 3105 ===
docker run -d ^
  --name pancake-server ^
  -p 3105:3000 ^
  -v pancake-server-data:/app/data ^
  --restart unless-stopped ^
  pancake-server

if %ERRORLEVEL% NEQ 0 (
    echo Run FAILED
    pause
    exit /b 1
)

echo.
echo === OK ===
echo Server chay tai: http://localhost:3105
pause
