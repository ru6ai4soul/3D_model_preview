@echo off
chcp 65001 >nul
cls
echo ========================================
echo    3D 模型預覽器 - 本地測試
echo ========================================
echo.

REM 檢查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 找不到 Python，請先安裝
    echo    下載: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo ✅ Python 已安裝
echo.

REM 檢查端口是否被佔用
netstat -ano | findstr :8000 >nul
if not errorlevel 1 (
    echo ⚠️  端口 8000 已被佔用
    echo    正在嘗試關閉...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do taskkill /F /PID %%a >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo 🚀 啟動伺服器...
echo.
echo 📍 網址: http://localhost:8000/index.html
echo.
echo ⚠️  保持此視窗開啟
echo    按 Ctrl+C 停止伺服器
echo.
echo ========================================
echo.

REM 開啟瀏覽器
start http://localhost:8000/index.html

REM 啟動伺服器
python -m http.server 8000
