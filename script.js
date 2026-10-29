document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const uploadArea = document.getElementById('uploadArea');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const fileInput = document.getElementById('fileInput');
    const editorArea = document.getElementById('editorArea');
    const imageCanvas = document.getElementById('imageCanvas');
    const ctx = imageCanvas.getContext('2d');
    const canvasContainer = document.getElementById('canvasContainer');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const fileSizeDisplay = document.getElementById('fileSizeDisplay');
    const compareBtn = document.getElementById('compareBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const trimBtn = document.getElementById('trimBtn');
    const maskBtn = document.getElementById('maskBtn');
    const resetBtn = document.getElementById('resetBtn');
    const qualityRange = document.getElementById('qualityRange');
    const qualityVal = document.getElementById('qualityVal');
    const filenameInput = document.getElementById('filenameInput');
    const saveBtn = document.getElementById('saveBtn');
    const shareBtn = document.getElementById('shareBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const cropOverlay = document.getElementById('cropOverlay');
    const cropBox = document.getElementById('cropBox');
    const applyCropBtn = document.getElementById('applyCropBtn');
    const cancelCropBtn = document.getElementById('cancelCropBtn');
    const toast = document.getElementById('toast');

    let originalImage = null;
    let workingCanvas = document.createElement('canvas'); // Base edited canvas
    let workingCtx = workingCanvas.getContext('2d');
    let currentBlob = null;
    let currentScale = 1.0;
    let originalFileName = 'image';

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.type === 'shared-image' && event.data.file) {
                    loadImageFile(event.data.file);
                }
            });
        }).catch(err => console.error('SW registration failed:', err));
    }

    // Check IndexedDB for shared image on startup
    async function checkSharedImage() {
        try {
            const db = await openDB();
            const tx = db.transaction('sharedImages', 'readonly');
            const store = tx.objectStore('sharedImages');
            const req = store.get('latestShared');
            req.onsuccess = (e) => {
                if (e.target.result && e.target.result.file) {
                    loadImageFile(e.target.result.file);
                    // Clear after loading
                    const delTx = db.transaction('sharedImages', 'readwrite');
                    delTx.objectStore('sharedImages').delete('latestShared');
                }
            };
        } catch (err) {
            console.error('IndexedDB check error:', err);
        }
    }
    checkSharedImage();

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('ImageEditorDB', 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('sharedImages')) {
                    db.createObjectStore('sharedImages', { keyPath: 'id' });
                }
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        });
    }

    // Format bytes to readable string
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Generate default filename: YYYYMMDD_HHMMSS
    function generateDefaultFilename() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const y = now.getFullYear();
        const m = pad(now.getMonth() + 1);
        const d = pad(now.getDate());
        const h = pad(now.getHours());
        const min = pad(now.getMinutes());
        const s = pad(now.getSeconds());
        return `${y}${m}${d}_${h}${min}${s}`;
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 2500);
    }

    function showLoading(text = '処理中...') {
        loadingText.textContent = text;
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    // File selection listeners
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) {
            loadImageFile(e.target.files[0]);
        }
    });

    uploadArea.addEventListener('dragover', e => e.preventDefault());
    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            loadImageFile(e.dataTransfer.files[0]);
        }
    });

    function loadImageFile(file) {
        showLoading('画像を読み込み中...');
        originalFileName = file.name ? (file.name.substring(0, file.name.lastIndexOf('.')) || 'image') : 'image';

        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                currentScale = 1.0;
                imageCanvas.style.transform = `scale(${currentScale})`;

                let w = img.width;
                let h = img.height;
                const maxDim = 1600;
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
                    else { w = Math.round(w * (maxDim / h)); h = maxDim; }
                }

                // Setup working canvas
                workingCanvas.width = w;
                workingCanvas.height = h;
                workingCtx.clearRect(0, 0, w, h);
                workingCtx.drawImage(img, 0, 0, w, h);

                // Setup display canvas
                imageCanvas.width = w;
                imageCanvas.height = h;
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(workingCanvas, 0, 0);

                uploadArea.classList.add('hidden');
                editorArea.classList.remove('hidden');
                fileNameDisplay.textContent = file.name || 'shared_image.webp';
                filenameInput.value = generateDefaultFilename();

                updatePreviewAndBlob();
                hideLoading();
                showToast('画像を読み込みました');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Update canvas display with compressed webp quality preview and file size
    function updatePreviewAndBlob() {
        if (!workingCanvas.width) return;
        const quality = parseInt(qualityRange.value, 10) / 100;
        qualityVal.textContent = qualityRange.value;

        workingCanvas.toBlob(blob => {
            currentBlob = blob;
            if (!blob) return;

            // Display live file size
            fileSizeDisplay.textContent = formatBytes(blob.size);

            // Render compressed blob back to display canvas to reflect quality preview
            const url = URL.createObjectURL(blob);
            const previewImg = new Image();
            previewImg.onload = () => {
                ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
                ctx.drawImage(previewImg, 0, 0);
                URL.revokeObjectURL(url);
            };
            previewImg.src = url;
        }, 'image/webp', quality);
    }

    qualityRange.addEventListener('input', updatePreviewAndBlob);

    // Zoom Controls
    zoomInBtn.addEventListener('click', () => {
        currentScale = Math.min(currentScale + 0.25, 4.0);
        imageCanvas.style.transform = `scale(${currentScale})`;
    });

    zoomOutBtn.addEventListener('click', () => {
        currentScale = Math.max(currentScale - 0.25, 0.5);
        imageCanvas.style.transform = `scale(${currentScale})`;
    });

    // Compare with Original (Hold/Touch)
    const showOrig = () => {
        if (!originalImage && !workingCanvas.width) return;
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(workingCanvas, 0, 0);
    };
    const hideOrig = () => {
        if (!workingCanvas.width) return;
        updatePreviewAndBlob();
    };

    compareBtn.addEventListener('mousedown', showOrig);
    compareBtn.addEventListener('mouseup', hideOrig);
    compareBtn.addEventListener('mouseleave', hideOrig);
    compareBtn.addEventListener('touchstart', (e) => { e.preventDefault(); showOrig(); });
    compareBtn.addEventListener('touchend', (e) => { e.preventDefault(); hideOrig(); });

    // Reset
    resetBtn.addEventListener('click', () => {
        if (!originalImage) return;
        currentScale = 1.0;
        imageCanvas.style.transform = `scale(${currentScale})`;
        
        let w = originalImage.width;
        let h = originalImage.height;
        const maxDim = 1600;
        if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
            else { w = Math.round(w * (maxDim / h)); h = maxDim; }
        }

        workingCanvas.width = w;
        workingCanvas.height = h;
        workingCtx.clearRect(0, 0, w, h);
        workingCtx.drawImage(originalImage, 0, 0, w, h);

        imageCanvas.width = w;
        imageCanvas.height = h;

        updatePreviewAndBlob();
        showToast('リセットしました');
    });

    // Circular Masking
    maskBtn.addEventListener('click', () => {
        if (!workingCanvas.width) return;
        showLoading('マスキング中...');
        setTimeout(() => {
            const w = workingCanvas.width;
            const h = workingCanvas.height;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = w;
            tempCanvas.height = h;
            const tCtx = tempCanvas.getContext('2d');

            tCtx.drawImage(workingCanvas, 0, 0);
            tCtx.globalCompositeOperation = 'destination-in';
            tCtx.beginPath();
            tCtx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
            tCtx.fill();

            workingCtx.clearRect(0, 0, w, h);
            workingCtx.drawImage(tempCanvas, 0, 0);

            updatePreviewAndBlob();
            hideLoading();
            showToast('丸型マスキングを適用しました');
        }, 50);
    });

    // Trimming setup
    let cropX = 0, cropY = 0, cropW = 200, cropH = 200;
    let isDragging = false, startX, startY;

    trimBtn.addEventListener('click', () => {
        if (!workingCanvas.width) return;
        cropOverlay.classList.remove('hidden');
        const rect = canvasContainer.getBoundingClientRect();
        cropW = Math.min(rect.width * 0.7, 250);
        cropH = cropW;
        cropX = (rect.width - cropW) / 2;
        cropY = (rect.height - cropH) / 2;
        updateCropBoxStyle();
    });

    function updateCropBoxStyle() {
        cropBox.style.left = `${cropX}px`;
        cropBox.style.top = `${cropY}px`;
        cropBox.style.width = `${cropW}px`;
        cropBox.style.height = `${cropH}px`;
    }

    cropBox.addEventListener('mousedown', startCropDrag);
    cropBox.addEventListener('touchstart', startCropDrag, { passive: false });

    function startCropDrag(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX - cropX;
        startY = clientY - cropY;
        e.stopPropagation();
    }

    window.addEventListener('mousemove', onCropDrag);
    window.addEventListener('touchmove', onCropDrag, { passive: false });

    function onCropDrag(e) {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        cropX = clientX - startX;
        cropY = clientY - startY;
        updateCropBoxStyle();
    }

    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('touchend', () => isDragging = false);

    cancelCropBtn.addEventListener('click', () => {
        cropOverlay.classList.add('hidden');
    });

    applyCropBtn.addEventListener('click', () => {
        showLoading('トリミング適用中...');
        cropOverlay.classList.add('hidden');

        setTimeout(() => {
            const canvasRect = imageCanvas.getBoundingClientRect();
            const scaleX = imageCanvas.width / canvasRect.width;
            const scaleY = imageCanvas.height / canvasRect.height;

            const boxRect = cropBox.getBoundingClientRect();
            const sx = (boxRect.left - canvasRect.left) * scaleX;
            const sy = (boxRect.top - canvasRect.top) * scaleY;
            const sw = boxRect.width * scaleX;
            const sh = boxRect.height * scaleY;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sw;
            tempCanvas.height = sh;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.drawImage(workingCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            workingCanvas.width = sw;
            workingCanvas.height = sh;
            workingCtx.clearRect(0, 0, sw, sh);
            workingCtx.drawImage(tempCanvas, 0, 0);

            imageCanvas.width = sw;
            imageCanvas.height = sh;

            currentScale = 1.0;
            imageCanvas.style.transform = `scale(${currentScale})`;
            updatePreviewAndBlob();
            hideLoading();
            showToast('トリミングを適用しました');
        }, 50);
    });

    // Save File
    saveBtn.addEventListener('click', () => {
        if (!currentBlob) return;
        const customName = filenameInput.value.trim() || generateDefaultFilename();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(currentBlob);
        a.download = `${customName}.webp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('WebP画像を保存しました');
    });

    // Share API
    if (navigator.share && navigator.canShare) {
        shareBtn.removeAttribute('disabled');
        shareBtn.addEventListener('click', async () => {
            if (!currentBlob) return;
            const customName = filenameInput.value.trim() || generateDefaultFilename();
            const file = new File([currentBlob], `${customName}.webp`, { type: 'image/webp' });
            if (navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'PWA 画像エディタ',
                        text: '編集した画像です'
                    });
                    showToast('画像を共有しました');
                } catch (err) {
                    if (err.name !== 'AbortError') showToast('共有に失敗しました');
                }
            } else {
                showToast('このデバイスでは共有できません');
            }
        });
    }
});