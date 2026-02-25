import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// Application state
const state = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    currentModel: null,
    mixer: null,
    animations: [],
    currentAction: null,
    gridHelper: null,
    ambientLight: null,
    directionalLight: null,
    autoRotateSpeed: 0,
    wireframeMode: false,
    clock: new THREE.Clock()
};

function init() {
    const container = document.getElementById('canvas-container');
    const canvas = document.getElementById('canvas');

    // Scene
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0a0a0a);

    // Size helper - use container dimensions
    const getSize = () => ({
        w: container.offsetWidth || window.innerWidth,
        h: container.offsetHeight || (window.innerHeight - 70),
    });
    const { w: initW, h: initH } = getSize();

    // Camera
    state.camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 1000);
    state.camera.position.set(5, 3, 5);

    // Renderer - setSize with false so CSS controls canvas display size
    state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    state.renderer.setSize(initW, initH, false);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.2;

    // ResizeObserver monitors container size changes
    const resizeObserver = new ResizeObserver(() => {
        // Skip resize if WebXR or Cardboard stereo is active
        if (state.renderer.xr.isPresenting || stereoActive) return;
        const { w, h } = getSize();
        if (w > 0 && h > 0) {
            state.camera.aspect = w / h;
            state.camera.updateProjectionMatrix();
            state.renderer.setSize(w, h, false);
        }
    });
    resizeObserver.observe(container);

    // Enable WebXR for VR/AR support
    state.renderer.xr.enabled = true;

    // Defer sizing to after layout (fixes iOS Safari canvas size)
    requestAnimationFrame(() => {
        const { w, h } = getSize();
        if (w > 0 && h > 0) {
            state.camera.aspect = w / h;
            state.camera.updateProjectionMatrix();
            state.renderer.setSize(w, h, false);
        }
    });

    // Controls - Optimized for touch devices
    state.controls = new OrbitControls(state.camera, canvas);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.minDistance = 1;
    state.controls.maxDistance = 50;

    // Touch-specific settings
    state.controls.touches = {
        ONE: THREE.TOUCH.ROTATE,      // 單指旋轉
        TWO: THREE.TOUCH.DOLLY_PAN    // 雙指縮放和平移
    };
    state.controls.rotateSpeed = 0.5;
    state.controls.zoomSpeed = 1.2;
    state.controls.panSpeed = 0.8;

    // Lights
    setupLights();

    // Grid
    state.gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    state.scene.add(state.gridHelper);

    // Check if model is specified in URL
    const urlParams = new URLSearchParams(window.location.search);
    const modelFile = urlParams.get('model');

    if (modelFile) {
        // Load model from URL parameter
        loadModelFromPath(modelFile);
    } else {
        // Load demo model
        loadDemoModel();
    }

    // Event listeners
    setupEventListeners();

    // Setup VR/AR buttons
    setupVRARButtons();

    // Remove loading screen
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
    }, 1000);

    // Start animation loop (WebXR compatible)
    state.renderer.setAnimationLoop(animate);
}

// Setup VR/AR Buttons
function setupVRARButtons() {
    const arButton = document.getElementById('ar-button');
    const vrButton = document.getElementById('vr-button');
    if (!arButton || !vrButton) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;

    const floatVR = document.getElementById('vr-float-btn');
    const floatAR = document.getElementById('ar-float-btn');
    const floatOverlay = document.getElementById('canvas-vr-overlay');

    function showBtn(btn, floatBtn) {
        if (btn) btn.style.display = 'flex';
        if (floatBtn) floatBtn.style.display = 'flex';
        if (floatOverlay) floatOverlay.style.display = 'flex';
    }

    // Position camera to properly frame the loaded model
    function frameModel() {
        if (!state.currentModel) return;
        const box = new THREE.Box3().setFromObject(state.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const dir = state.camera.position.clone().sub(center).normalize();
        state.camera.position.copy(center).addScaledVector(dir, maxDim * 2.5);
        state.camera.position.y = center.y + maxDim * 0.5;
        state.controls.target.copy(center);
        state.controls.update();
    }

    // --------------------------------------------------
    // WebXR AR (Android Chrome with ARCore)
    // --------------------------------------------------
    if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
            if (!supported) return;
            showBtn(arButton, floatAR);

            const doAR = async () => {
                if (!state.currentModel) { alert('請先載入模型'); return; }

                const active = state.renderer.xr.getSession?.() || null;
                if (active) {
                    try { await active.end(); } catch (e) { console.error(e); }
                    return;
                }

                try {
                    let session;
                    let refSpaceType = 'local';

                    // Try 'local' reference space first, fall back to 'viewer'
                    try {
                        session = await navigator.xr.requestSession('immersive-ar', {
                            requiredFeatures: ['local'],
                            optionalFeatures: ['hit-test'],
                        });
                        refSpaceType = 'local';
                    } catch {
                        session = await navigator.xr.requestSession('immersive-ar', {
                            requiredFeatures: ['viewer'],
                        });
                        refSpaceType = 'viewer';
                    }

                    // MUST set reference space type BEFORE setSession
                    state.renderer.xr.setReferenceSpaceType(refSpaceType);

                    // Transparent background for AR camera passthrough
                    const prevBg = state.scene.background;
                    state.scene.background = null;
                    state.renderer.setClearAlpha(0);

                    await state.renderer.xr.setSession(session);
                    const exitLabel = '<span class="btn-icon">❌</span><span class="btn-text">退出 AR</span>';
                    arButton.innerHTML = exitLabel;
                    if (floatAR) floatAR.innerHTML = exitLabel;

                    session.addEventListener('end', () => {
                        state.scene.background = prevBg;
                        state.renderer.setClearAlpha(1);
                        // Reset reference space to default for VR
                        state.renderer.xr.setReferenceSpaceType('local-floor');
                        const normalLabel = '<span class="btn-icon">📱</span><span class="btn-text">AR 模式</span>';
                        arButton.innerHTML = normalLabel;
                        if (floatAR) floatAR.innerHTML = '<span class="btn-icon">📱</span><span class="btn-text">AR</span>';
                    });
                } catch (e) {
                    console.error('AR 啟動失敗:', e);
                    alert('AR 啟動失敗\n\n原因: ' + e.message);
                }
            };

            arButton.addEventListener('click', doAR);
            if (floatAR) floatAR.addEventListener('click', doAR);
        });
    }

    // --------------------------------------------------
    // WebXR VR (Android / Desktop)
    // Falls back to Cardboard stereo on iOS
    // --------------------------------------------------
    if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported) {
                showBtn(vrButton, floatVR);

                // Save/restore model transform for VR scaling
                let vrModelSavedScale = null;
                let vrModelSavedPos = null;

                function scaleModelForVR() {
                    if (!state.currentModel) return;
                    const box = new THREE.Box3().setFromObject(state.currentModel);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);

                    // Save original transform
                    vrModelSavedScale = state.currentModel.scale.clone();
                    vrModelSavedPos = state.currentModel.position.clone();

                    // Scale so the model fits in ~0.4m (comfortable VR size)
                    const targetSize = 0.4;
                    const scaleFactor = targetSize / maxDim;
                    state.currentModel.scale.multiplyScalar(scaleFactor);

                    // Position 1.5m in front, at eye height
                    state.currentModel.position.set(0, 1.2, -1.5);
                }

                function restoreModelFromVR() {
                    if (!state.currentModel || !vrModelSavedScale) return;
                    state.currentModel.scale.copy(vrModelSavedScale);
                    state.currentModel.position.copy(vrModelSavedPos);
                    vrModelSavedScale = null;
                    vrModelSavedPos = null;
                }

                const doVR = async () => {
                    if (!state.currentModel) { alert('請先載入模型'); return; }

                    const active = state.renderer.xr.getSession?.() || null;
                    if (active) {
                        try { await active.end(); } catch (e) { console.error(e); }
                        return;
                    }

                    scaleModelForVR();

                    try {
                        const session = await navigator.xr.requestSession('immersive-vr', {
                            optionalFeatures: ['local-floor', 'bounded-floor'],
                        });
                        await state.renderer.xr.setSession(session);
                        const exitLabel = '<span class="btn-icon">👁️</span><span class="btn-text">退出 VR</span>';
                        vrButton.innerHTML = exitLabel;
                        if (floatVR) floatVR.innerHTML = exitLabel;

                        session.addEventListener('end', () => {
                            restoreModelFromVR();
                            const normalLabel = '<span class="btn-icon">🥽</span><span class="btn-text">VR 模式</span>';
                            vrButton.innerHTML = normalLabel;
                            if (floatVR) floatVR.innerHTML = '<span class="btn-icon">🥽</span><span class="btn-text">VR</span>';
                            // Restore canvas size
                            const container = document.getElementById('canvas-container');
                            const w = container.offsetWidth || window.innerWidth;
                            const h = container.offsetHeight || (window.innerHeight - 70);
                            state.camera.aspect = w / h;
                            state.camera.updateProjectionMatrix();
                            state.renderer.setSize(w, h, false);
                        });
                    } catch (e) {
                        restoreModelFromVR();
                        console.error('VR 啟動失敗:', e);
                        alert('VR 啟動失敗: ' + e.message);
                    }
                };

                vrButton.addEventListener('click', doVR);
                if (floatVR) floatVR.addEventListener('click', doVR);

            } else if (isIOS) {
                // iOS Safari: WebXR VR not supported → Cardboard stereo
                showBtn(vrButton, floatVR);
                let inVR = false;

                const doCardboard = () => {
                    if (!state.currentModel) { alert('請先載入模型'); return; }
                    inVR = !inVR;

                    if (inVR) {
                        frameModel();
                        state.camera.fov = 80;
                        state.camera.updateProjectionMatrix();
                        enterStereoMode();
                        const exitLabel = '<span class="btn-icon">👁️</span><span class="btn-text">退出 VR</span>';
                        vrButton.innerHTML = exitLabel;
                        if (floatVR) floatVR.innerHTML = exitLabel;
                    } else {
                        exitStereoMode();
                        const normalLabel = '<span class="btn-icon">🥽</span><span class="btn-text">VR 模式</span>';
                        vrButton.innerHTML = normalLabel;
                        if (floatVR) floatVR.innerHTML = '<span class="btn-icon">🥽</span><span class="btn-text">VR</span>';
                    }
                };

                vrButton.addEventListener('click', doCardboard);
                if (floatVR) floatVR.addEventListener('click', doCardboard);
            }
        });
    }
} // end setupVRARButtons

// Load model from file path
function loadModelFromPath(filePath) {
    const loadingText = document.querySelector('.loading-text');
    const loadingScreen = document.getElementById('loading-screen');

    loadingScreen.classList.remove('hidden');
    loadingText.textContent = `載入模型中...`;

    const extension = filePath.split('.').pop().toLowerCase();
    const filename = filePath.split('/').pop();

    if (extension === 'glb' || extension === 'gltf') {
        // Use GLTFLoader directly
        const loader = new GLTFLoader();
        loader.load(
            filePath,
            (gltf) => {
                console.log('=== GLTF Model Loaded from Gallery ===');
                console.log('Model:', gltf.scene);

                // Clear previous model
                if (state.currentModel) {
                    state.scene.remove(state.currentModel);
                }

                const model = gltf.scene;
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                centerAndScaleModel(model);
                state.currentModel = model;
                state.scene.add(model);

                if (gltf.animations && gltf.animations.length > 0) {
                    state.animations = gltf.animations;
                    state.mixer = new THREE.AnimationMixer(model);
                    setupAnimationUI(gltf.animations);
                } else {
                    hideAnimationControls();
                }

                const stats = getModelStats(model);
                updateModelInfo(filename, stats.vertices, stats.faces, gltf.animations?.length || 0);
                loadingScreen.classList.add('hidden');
            },
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(0);
                loadingText.textContent = `載入中... ${percent}%`;
            },
            (error) => {
                console.error('Failed to load GLTF model:', error);
                loadingScreen.classList.add('hidden');
                alert('無法載入模型: ' + error.message);
                loadDemoModel();
            }
        );
    } else if (extension === 'fbx') {
        // Use FBXLoader directly
        const loader = new FBXLoader();
        loader.load(
            filePath,
            (model) => {
                console.log('=== FBX Model Loaded from Gallery ===');
                console.log('Model:', model);

                // Clear previous model
                if (state.currentModel) {
                    state.scene.remove(state.currentModel);
                }

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (!child.material) {
                            child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        }
                    }
                });

                centerAndScaleModel(model);
                state.currentModel = model;
                state.scene.add(model);

                if (model.animations && model.animations.length > 0) {
                    state.animations = model.animations;
                    state.mixer = new THREE.AnimationMixer(model);
                    setupAnimationUI(model.animations);
                } else {
                    hideAnimationControls();
                }

                const stats = getModelStats(model);
                updateModelInfo(filename, stats.vertices, stats.faces, model.animations?.length || 0);
                loadingScreen.classList.add('hidden');
            },
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(0);
                loadingText.textContent = `載入中... ${percent}%`;
            },
            (error) => {
                console.error('Failed to load FBX model:', error);
                loadingScreen.classList.add('hidden');
                alert('無法載入模型: ' + error.message);
                loadDemoModel();
            }
        );
    } else {
        loadingScreen.classList.add('hidden');
        alert('不支援的檔案格式: ' + extension);
        loadDemoModel();
    }
}

function setupLights() {
    state.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    state.scene.add(state.ambientLight);

    state.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    state.directionalLight.position.set(5, 10, 5);
    state.directionalLight.castShadow = true;
    state.directionalLight.shadow.mapSize.width = 2048;
    state.directionalLight.shadow.mapSize.height = 2048;
    state.scene.add(state.directionalLight);

    const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.5);
    rimLight.position.set(-5, 5, -5);
    state.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xff00ff, 0.3);
    fillLight.position.set(0, -5, 5);
    state.scene.add(fillLight);
}

function loadDemoModel() {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial({
        color: 0x00d4ff,
        metalness: 0.7,
        roughness: 0.3
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;

    const sphereGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0xff00ff,
        metalness: 0.8,
        roughness: 0.2
    });

    const group = new THREE.Group();
    group.add(cube);

    for (let i = 0; i < 4; i++) {
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        const angle = (i / 4) * Math.PI * 2;
        sphere.position.set(Math.cos(angle) * 2, 0, Math.sin(angle) * 2);
        sphere.castShadow = true;
        group.add(sphere);
    }

    state.currentModel = group;
    state.scene.add(group);

    updateModelInfo('Demo Model', geometry.attributes.position.count, geometry.index.count / 3, 0);
}

function loadModel(file) {
    const loadingText = document.querySelector('.loading-text');
    const loadingScreen = document.getElementById('loading-screen');

    loadingScreen.classList.remove('hidden');
    loadingText.textContent = `Loading ${file.name}...`;

    // Remove current model
    if (state.currentModel) {
        state.scene.remove(state.currentModel);
        state.currentModel = null;
    }

    // Stop animations
    if (state.mixer) {
        state.mixer.stopAllAction();
        state.mixer = null;
    }
    state.animations = [];
    state.currentAction = null;

    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target.result;
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension === 'glb' || extension === 'gltf') {
            loadGLTF(contents, file.name);
        } else if (extension === 'fbx') {
            loadFBX(contents, file.name);
        }
    };
    reader.readAsArrayBuffer(file);
}

function loadGLTF(data, filename) {
    const loader = new GLTFLoader();
    loader.parse(data, '', (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        centerAndScaleModel(model);
        state.currentModel = model;
        state.scene.add(model);

        if (gltf.animations && gltf.animations.length > 0) {
            state.animations = gltf.animations;
            state.mixer = new THREE.AnimationMixer(model);
            setupAnimationUI(gltf.animations);
        } else {
            hideAnimationControls();
        }

        const stats = getModelStats(model);
        updateModelInfo(filename, stats.vertices, stats.faces, gltf.animations?.length || 0);
        document.getElementById('loading-screen').classList.add('hidden');
    });
}

function loadFBX(data, filename) {
    const loader = new FBXLoader();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    loader.load(url, (model) => {
        URL.revokeObjectURL(url);

        console.log('=== FBX Model Loaded ===');
        console.log('Model:', model);
        console.log('Children:', model.children.length);

        // Apply bright fallback materials for visibility
        let meshCount = 0;
        model.traverse((child) => {
            if (child.isMesh) {
                meshCount++;
                child.castShadow = true;
                child.receiveShadow = true;

                console.log('Mesh found:', child.name, 'Material:', child.material);

                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(mat => {
                        // Set bright color for visibility
                        mat.color.setHex(0xffffff);  // White instead of gray
                        mat.side = THREE.DoubleSide;
                        mat.transparent = false;
                        mat.opacity = 1.0;
                        mat.needsUpdate = true;

                        console.log('Material updated:', mat.type, 'Color:', mat.color);
                    });
                }
            }
        });

        console.log('Total meshes:', meshCount);

        // Get original bounds
        const originalBox = new THREE.Box3().setFromObject(model);
        console.log('Original bounds:', {
            min: originalBox.min,
            max: originalBox.max,
            size: originalBox.getSize(new THREE.Vector3())
        });

        centerAndScaleModel(model);

        state.currentModel = model;
        state.scene.add(model);

        // Get new bounds after scaling
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        console.log('After scaling:', {
            center,
            size,
            position: model.position,
            scale: model.scale
        });

        // Adjust camera to optimal position
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = state.camera.fov * (Math.PI / 180);
        let cameraDistance = Math.abs(maxDim / Math.tan(fov / 2));
        cameraDistance *= 1.8;  // Add more margin

        state.camera.position.set(cameraDistance, cameraDistance * 0.7, cameraDistance);
        state.controls.target.copy(center);
        state.controls.update();

        console.log('Camera position:', state.camera.position);
        console.log('Camera target:', state.controls.target);

        if (model.animations && model.animations.length > 0) {
            state.animations = model.animations;
            state.mixer = new THREE.AnimationMixer(model);
            setupAnimationUI(model.animations);
        } else {
            hideAnimationControls();
        }

        const stats = getModelStats(model);
        updateModelInfo(filename, stats.vertices, stats.faces, model.animations?.length || 0);
        document.getElementById('loading-screen').classList.add('hidden');
    }, undefined, (error) => {
        console.error('FBX Load Error:', error);
        URL.revokeObjectURL(url);
        document.getElementById('loading-screen').classList.add('hidden');
        alert('載入 FBX 時發生錯誤: ' + error.message);
    });
}

function centerAndScaleModel(model) {
    // Reset transformations
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);

    // Get original bounds
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    // Scale first
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
        model.scale.setScalar(8 / maxDim);
    }
    model.updateMatrixWorld(true);

    // Get bounds after scaling
    const scaledBox = new THREE.Box3().setFromObject(model);
    const center = scaledBox.getCenter(new THREE.Vector3());

    // Now position: center on X/Z, bottom at Y=0
    model.position.x = -center.x;
    model.position.y = -scaledBox.min.y;  // Bottom at ground level
    model.position.z = -center.z;

    console.log('Centering complete:', {
        finalPosition: model.position,
        scale: model.scale,
        bottomY: scaledBox.min.y
    });
}

function getModelStats(model) {
    let vertices = 0, faces = 0;
    model.traverse((child) => {
        if (child.isMesh) {
            const g = child.geometry;
            if (g.attributes.position) vertices += g.attributes.position.count;
            if (g.index) faces += g.index.count / 3;
        }
    });
    return { vertices, faces };
}

function updateModelInfo(name, vertices, faces, animationCount) {
    document.getElementById('model-name').textContent = name;
    document.getElementById('vertex-count').textContent = vertices.toLocaleString();
    document.getElementById('face-count').textContent = Math.floor(faces).toLocaleString();
    document.getElementById('animation-count').textContent = animationCount;
}

function setupAnimationUI(animations) {
    const section = document.getElementById('animation-section');
    const select = document.getElementById('animation-select');

    select.innerHTML = '<option value="">選擇動畫</option>';
    animations.forEach((clip, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = clip.name || `Animation ${index + 1}`;
        select.appendChild(option);
    });

    section.style.display = 'block';
    if (animations.length > 0) {
        select.value = '0';
        playAnimation(0);
    }
}

function hideAnimationControls() {
    document.getElementById('animation-section').style.display = 'none';
}

function playAnimation(index) {
    if (!state.mixer || !state.animations[index]) return;
    if (state.currentAction) state.currentAction.stop();

    const clip = state.animations[index];
    state.currentAction = state.mixer.clipAction(clip);
    state.currentAction.loop = document.getElementById('loop-checkbox').checked ? THREE.LoopRepeat : THREE.LoopOnce;
    state.currentAction.timeScale = parseFloat(document.getElementById('speed-slider').value);
    state.currentAction.play();

    document.getElementById('timeline-slider').max = clip.duration;
    document.getElementById('total-time').textContent = clip.duration.toFixed(2);
    updatePlayButtonState(true);
}

function updatePlayButtonState(isPlaying) {
    const icon = document.querySelector('#play-pause-btn .play-icon');
    icon.textContent = isPlaying ? '⏸' : '▶';
}

function setupEventListeners() {
    document.getElementById('load-model-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    }); document.getElementById('file-input').addEventListener('change', (e) => { if (e.target.files[0]) loadModel(e.target.files[0]); });

    document.getElementById('animation-select').addEventListener('change', (e) => {
        const i = parseInt(e.target.value);
        if (!isNaN(i)) playAnimation(i);
    });

    document.getElementById('play-pause-btn').addEventListener('click', () => {
        if (!state.currentAction) return;
        state.currentAction.paused = !state.currentAction.paused;
        updatePlayButtonState(!state.currentAction.paused);
    });

    document.getElementById('stop-btn').addEventListener('click', () => {
        if (state.currentAction) {
            state.currentAction.stop();
            state.mixer.setTime(0);
            updatePlayButtonState(false);
            document.getElementById('timeline-slider').value = 0;
            document.getElementById('current-time').textContent = '0.00';
        }
    });

    document.getElementById('timeline-slider').addEventListener('input', (e) => {
        if (state.mixer && state.currentAction) state.mixer.setTime(parseFloat(e.target.value));
    });

    document.getElementById('speed-slider').addEventListener('input', (e) => {
        const s = parseFloat(e.target.value);
        document.getElementById('speed-value').textContent = s.toFixed(1);
        if (state.currentAction) state.currentAction.timeScale = s;
    });

    document.getElementById('loop-checkbox').addEventListener('change', (e) => {
        if (state.currentAction) state.currentAction.loop = e.target.checked ? THREE.LoopRepeat : THREE.LoopOnce;
    });

    document.getElementById('ambient-slider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('ambient-value').textContent = v.toFixed(1);
        state.ambientLight.intensity = v;
    });

    document.getElementById('directional-slider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('directional-value').textContent = v.toFixed(1);
        state.directionalLight.intensity = v;
    });

    document.getElementById('bg-color').addEventListener('input', (e) => {
        state.scene.background = new THREE.Color(e.target.value);
    });

    document.getElementById('grid-checkbox').addEventListener('change', (e) => {
        state.gridHelper.visible = e.target.checked;
    });

    document.getElementById('wireframe-checkbox').addEventListener('change', (e) => {
        state.wireframeMode = e.target.checked;
        if (state.currentModel) {
            state.currentModel.traverse((c) => {
                if (c.isMesh) c.material.wireframe = state.wireframeMode;
            });
        }
    });

    document.getElementById('reset-camera-btn').addEventListener('click', () => {
        if (state.currentModel) {
            const box = new THREE.Box3().setFromObject(state.currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = state.camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
            state.camera.position.set(cameraZ, cameraZ * 0.6, cameraZ);
            state.controls.target.copy(center);
        } else {
            state.camera.position.set(5, 3, 5);
            state.controls.target.set(0, 0, 0);
        }
        state.controls.update();
    });

    document.getElementById('rotate-slider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('rotate-value').textContent = v.toFixed(1);
        state.autoRotateSpeed = v;
    });

    // Panel toggle button - 單一按鈕控制開關
    const panelToggleBtn = document.getElementById('panel-toggle');
    const panel = document.querySelector('.control-panel');

    if (panelToggleBtn && panel) {
        panelToggleBtn.addEventListener('click', function () {
            panel.classList.toggle('collapsed');
            const isCollapsed = panel.classList.contains('collapsed');
            this.textContent = isCollapsed ? '▶' : '◀';
        });
    }

    // AR/VR 功能
    setupVRARButtons();

    // Background color control
    document.getElementById('bg-color').addEventListener('input', (e) => {
        state.scene.background = new THREE.Color(e.target.value);
    });
}

// Global function for panel toggle (called from HTML onclick)
window.togglePanel = function () {
    const panel = document.querySelector('.control-panel');
    const btnText = document.getElementById('panel-toggle-text');
    if (panel) {
        panel.classList.toggle('collapsed');
        // 更新按鈕文字（如果存在）
        if (btnText) {
            btnText.textContent = panel.classList.contains('collapsed') ? '開啟面板' : '關閉面板';
        }
    }
};

function animate() {
    const delta = state.clock.getDelta();

    if (state.mixer) state.mixer.update(delta);

    if (state.currentAction) {
        const time = state.mixer.time;
        document.getElementById('timeline-slider').value = time;
        document.getElementById('current-time').textContent = time.toFixed(2);
    }

    if (state.autoRotateSpeed > 0 && state.currentModel) {
        state.currentModel.rotation.y += state.autoRotateSpeed * delta;
    }

    state.controls.update();

    // 立體 VR 模式下左右分屏，否則正常渲染
    if (stereoActive) {
        renderStereo();
    } else {
        state.renderer.render(state.scene, state.camera);
    }

    updateFPS(delta);
}

// 立體左右分屏渲染（Cardboard VR）
function renderStereo() {
    const renderer = state.renderer;
    const scene = state.scene;
    const camera = state.camera;
    const W = renderer.domElement.width;
    const H = renderer.domElement.height;
    const halfW = Math.floor(W / 2);
    const eyeSep = 0.032; // 每眼偏移 32mm

    // 重要：每眼的 aspect = halfW / H
    const eyeAspect = halfW / H;
    camera.aspect = eyeAspect;
    camera.updateProjectionMatrix();

    renderer.setScissorTest(true);

    // 計算相機右方向向量
    const origPos = camera.position.clone();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();

    // 左眼
    camera.position.copy(origPos).addScaledVector(right, -eyeSep);
    renderer.setViewport(0, 0, halfW, H);
    renderer.setScissor(0, 0, halfW, H);
    renderer.render(scene, camera);

    // 右眼
    camera.position.copy(origPos).addScaledVector(right, eyeSep);
    renderer.setViewport(halfW, 0, halfW, H);
    renderer.setScissor(halfW, 0, halfW, H);
    renderer.render(scene, camera);

    // 恢復相機位置
    camera.position.copy(origPos);
}

function updateFPS(delta) {
    const fps = Math.round(1 / delta);
    document.getElementById('fps-counter').textContent = `FPS: ${fps}`;
}




// 進入立體 VR 模式（Cardboard）
let stereoActive = false;
let stereoEffect = null;
let deviceControls = null;

function enterStereoMode() {
    stereoActive = true;

    // 全螢幕
    const el = document.documentElement;
    const doFullscreen = el.requestFullscreen || el.webkitRequestFullscreen;
    if (doFullscreen) doFullscreen.call(el);

    // 等全螢幕生效後再調整尺寸（fullscreenchange 事件）
    const onFS = () => {
        document.removeEventListener('fullscreenchange', onFS);
        document.removeEventListener('webkitfullscreenchange', onFS);

        // 取橫向螢幕尺寸
        const sw = window.screen.width;
        const sh = window.screen.height;
        const landscapeW = Math.max(sw, sh);
        const landscapeH = Math.min(sw, sh);

        state.renderer.setSize(landscapeW, landscapeH);
        // 注意: renderStereo() 會再設定每眼正確的 aspect，這裡只需設初始
        state.camera.aspect = (landscapeW / 2) / landscapeH;
        state.camera.updateProjectionMatrix();
    };
    document.addEventListener('fullscreenchange', onFS);
    document.addEventListener('webkitfullscreenchange', onFS);

    // 啟用陀螺儀
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(p => { if (p === 'granted') enableGyroscope(); })
            .catch(console.error);
    } else {
        enableGyroscope();
    }

    // 鎖定橫向
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => { });
    }
}

// 啟用陀螺儀控制
function enableGyroscope() {
    window.addEventListener('deviceorientation', handleOrientation, true);
}

// 處理陀螺儀數據
let alpha = 0, beta = 0, gamma = 0;
function handleOrientation(event) {
    alpha = event.alpha || 0;  // Z 軸旋轉
    beta = event.beta || 0;    // X 軸旋轉
    gamma = event.gamma || 0;  // Y 軸旋轉

    // 將陀螺儀數據應用到相機
    if (state.camera && stereoActive) {
        // 轉換為弧度
        const alphaRad = alpha * (Math.PI / 180);
        const betaRad = beta * (Math.PI / 180);
        const gammaRad = gamma * (Math.PI / 180);

        // 更新相機旋轉
        state.camera.rotation.set(betaRad, alphaRad, -gammaRad, 'YXZ');
    }
}

// 退出立體 VR 模式
function exitStereoMode() {
    stereoActive = false;

    // 退出全螢幕
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();

    // 停用陀螺儀
    window.removeEventListener('deviceorientation', handleOrientation, true);

    // 恢復正常渲染 - 使用容器實際尺寸
    state.renderer.setScissorTest(false);
    const container = document.getElementById('canvas-container');
    const w = container.offsetWidth || window.innerWidth;
    const h = container.offsetHeight || (window.innerHeight - 70);
    state.camera.fov = 45;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h, false);
    state.renderer.setViewport(0, 0, w, h);

    // 重置相機旋轉
    state.camera.rotation.set(0, 0, 0);
}

// Initialize the application
init();
