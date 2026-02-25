# 3D 模型預覽器

一個功能豐富的 3D 模型查看器，支援 GLB、GLTF、FBX 格式，並提供 VR/AR 功能。

## ✨ 功能特色

- 🎨 支援多種 3D 模型格式（GLB, GLTF, FBX）
- 🎬 動畫播放與控制
- 🎮 互動式控制面板
- 📱 響應式設計（桌面 + 手機）
- 🥽 VR 模式（Google Cardboard 支援）
- 📱 AR 模式（Android WebXR）
- 🌈 自訂背景顏色和光線
- 📊 即時 FPS 顯示
- 🔄 自動旋轉功能

## 🚀 使用方式

### 線上版本

訪問：`https://ru6ai4soul.github.io/3D_model_preview/`

### 本地運行

1. 下載或克隆此倉庫
2. 在專案目錄執行：
   ```bash
   python -m http.server 8000
   ```
3. 開啟瀏覽器訪問：`http://localhost:8000/index.html`

## 📱 VR 功能使用

### Cardboard VR（手機）

1. 載入 3D 模型
2. 點擊「VR 模式」按鈕
3. 允許陀螺儀權限（iOS 13+）
4. 將手機放入 Google Cardboard 或類似裝置
5. 轉動頭部環顧 3D 場景

### Android AR

1. 使用 Android 手機的 Chrome 瀏覽器
2. 載入模型
3. 點擊「AR 模式」按鈕
4. 允許相機權限
5. 在真實環境中放置模型

## 🛠️ 技術棧

- **Three.js** - 3D 渲染引擎
- **WebXR** - VR/AR API
- **OrbitControls** - 相機控制
- **GLTFLoader / FBXLoader** - 模型載入器

## 📂 專案結構

```
3d-model-viewer/
├── index.html          # 主頁面
├── gallery.html        # 模型庫
├── app.js             # 主程式邏輯
├── style.css          # 樣式表
├── libs/              # Three.js 函式庫
├── models/            # 3D 模型檔案
└── thumbnails/        # 模型縮圖
```

## 🌐 瀏覽器支援

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## 📱 行動裝置支援

- ✅ iOS 13+ (Safari, Chrome)
- ✅ Android 8+ (Chrome)

## 📄 授權

MIT License

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📧 聯絡

如有問題或建議，請開啟 Issue。

---

**版本**: v7.8-VR  
**最後更新**: 2026-02-25
