@echo off
chcp 65001 >nul
cls
echo ========================================
echo    3D 模型預覽器 - 區域網路測試
echo    版本: v7.1-VR
echo ========================================
echo.

REM 獲取本機 IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do set IP=%%a
set IP=%IP:~1%

echo [1/2] 啟動本地伺服器...
echo.

REM 檢查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 找不到 Python
    pause
    exit /b 1
)

echo ✅ Python 已安裝
echo.

REM 關閉舊的伺服器
netstat -ano | findstr :8000 >nul
if not errorlevel 1 (
    echo 🔄 關閉舊的伺服器...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do taskkill /F /PID %%a >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo [2/2] 伺服器資訊
echo.
echo 📱 在 iPhone 上開啟以下網址：
echo.
echo    http://%IP%:8000/index.html
echo.
echo ⚠️  確保：
echo    1. iPhone 和電腦在同一 WiFi
echo    2. 防火牆允許連接
echo    3. 保持此視窗開啟
echo.
echo ========================================
echo.

REM 啟動伺服器
python -m http.server 8000
