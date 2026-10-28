document.addEventListener('DOMContentLoaded', () => {
    const imageCanvas = document.getElementById('imageCanvas');
    const ctx = imageCanvas.getContext('2d');
    const imageInput = document.getElementById('imageInput');
    const selectImageButton = document.getElementById('selectImageButton');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const controls = document.getElementById('controls');
    const webpQuality = document.getElementById('webpQuality');
    const webpQualityValue = document.getElementById('webpQualityValue');
    const trimButton = document.getElementById('trimButton');
    const maskButton = document.getElementById('maskButton');
    const resetButton = document.getElementById('resetButton');
    const saveButton = document.getElementById('saveButton');
    const shareButton = document.getElementById('shareButton');
    const messageDisplay = document.getElementById('message');
    const loadingOverlay = document.getElementById('loading');
    const imageArea = document.querySelector('.image-area');
    const canvasContainer = document.getElementById('canvasContainer');
    const fileInfoArea = document.getElementById('fileInfoArea');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const outputFilename = document.getElementById('outputFilename');
    const compareButton = document.getElementById('compareButton');

    // トリミング用DOM
    const cropOverlay = document.getElementById('cropOverlay');
    const cropRect = document.getElementById('cropRect');
    const applyCropButton = document.getElementById('applyCropButton');
    const cancelCropButton = document.getElementById('cancelCropButton');

    let originalImage = null;
    let currentImageBlob = null;
    let scale = 1.0;
    let cropStartX, cropStartY;
    let cropRectX, cropRectY, cropRectWidth, cropRectHeight;

    // Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    navigator.serviceWorker.addEventListener('message', event => {
                        if (event.data.type === 'shared-image' && event.data.file) {
                            displayImage(event.data.file);
                        }
                    });
                })
                .catch(err => console.error('SW registration error:', err));
        });
    }

    // IndexedDB for Shared Images
    const DB_NAME = 'ImageEditorDB';
    const STORE_NAME = 'sharedImages';

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            request.onsuccess = e => resolve(e.target.result);
            request.onerror = e => reject(e.target.error);
        });
    }

    async function getLatestImageFromDB() {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get('latestShared');
            return new Promise(resolve => {
                req.onsuccess = e => resolve(e.target.result ? e.target.result.file : null);
                req.onerror = () => resolve(null);
            });
        } catch {
            return null;
        }
    }

    async function checkSharedImage() {
        const file = await getLatestImageFromDB();
        if (file) displayImage(file);
    }
    checkSharedImage();

    function generateDefaultFilename() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return `${y}${m}${d}_${h}${min}${s}`;
    }

    selectImageButton.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) displayImage(file);
        else showMessage('有効な画像を選択してください。', 'error');
    });

    imageArea.addEventListener('dragover', e => e.preventDefault());
    imageArea.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) displayImage(file);
    });

    webpQuality.addEventListener('input', () => {
        webpQualityValue.textContent = webpQuality.value;
        updateCurrentBlob();
    });

    const showOriginal = () => {
        if (!originalImage) return;
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(originalImage, 0, 0, imageCanvas.width, imageCanvas.height);
    };

    const hideOriginal = () => {
        if (!originalImage) return;
        updateCurrentBlob();
    };

    compareButton.addEventListener('mousedown', showOriginal);
    compareButton.addEventListener('mouseup', hideOriginal);
    compareButton.addEventListener('mouseleave', hideOriginal);
    compareButton.addEventListener('touchstart', (e) => { e.preventDefault(); showOriginal(); });
    compareButton.addEventListener('touchend', (e) => { e.preventDefault(); hideOriginal(); });

    canvasContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        scale += e.deltaY * -0.001;
        scale = Math.min(Math.max(0.5, scale), 5.0);
        imageCanvas.style.transform = `scale(${scale})`;
    }, { passive: false });

    resetButton.addEventListener('click', () => {
        if (!originalImage) return;
        scale = 1.0;
        imageCanvas.style.transform = `scale(${scale})`;
        imageCanvas.width = originalImage.width;
        imageCanvas.height = originalImage.height;
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(originalImage, 0, 0);
        updateCurrentBlob();
        showMessage('画像をリセットしました。');
    });

    trimButton.addEventListener('click', () => {
        if (!originalImage) return;
        enterCropMode();
    });

    maskButton.addEventListener('click', () => {
        if (!originalImage) return;
        showLoading('マスキング中...');

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageCanvas.width;
        tempCanvas.height = imageCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.drawImage(imageCanvas, 0, 0);
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.beginPath();
        const cx = tempCanvas.width / 2;
        const cy = tempCanvas.height / 2;
        const r = Math.min(cx, cy) * 0.85;
        tempCtx.arc(cx, cy, r, 0, Math.PI * 2);
        tempCtx.fill();

        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        updateCurrentBlob();
        hideLoading();
        showMessage('画像を円形にマスキングしました。');
    });

    saveButton.addEventListener('click', () => {
        if (!currentImageBlob) {
            showMessage('保存する画像がありません。', 'error');
            return;
        }
        const customName = outputFilename.value.trim() || generateDefaultFilename();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(currentImageBlob);
        a.download = `${customName}.webp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showMessage('WebP画像を保存しました！');
    });

    if (navigator.share) {
        shareButton.removeAttribute('disabled');
        shareButton.addEventListener('click', async () => {
            if (!currentImageBlob) return;
            const customName = outputFilename.value.trim() || generateDefaultFilename();
            const file = new File([currentImageBlob], `${customName}.webp`, { type: 'image/webp' });
            try {
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'PWA画像エディタ', text: '編集した画像です' });
                    showMessage('画像を共有しました！');
                } else {
                    showMessage('このファイルは共有できません', 'error');
                }
            } catch (err) {
                if (err.name !== 'AbortError') showMessage('共有に失敗しました', 'error');
            }
        });
    }

    function showMessage(msg) {
        messageDisplay.textContent = msg;
    }

    function showLoading(msg = '処理中...') {
        loadingOverlay.querySelector('p').textContent = msg;
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    function displayImage(fileOrUrl) {
        showLoading('画像を読み込み中...');
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            scale = 1.0;
            imageCanvas.style.transform = `scale(${scale})`;

            const MAX_DIM = 1200;
            let w = img.width;
            let h = img.height;
            if (w > MAX_DIM || h > MAX_DIM) {
                if (w > h) { h *= MAX_DIM / w; w = MAX_DIM; }
                else { w *= MAX_DIM / h; h = MAX_DIM; }
            }

            imageCanvas.width = w;
            imageCanvas.height = h;
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);

            imageCanvas.classList.remove('hidden');
            uploadPrompt.classList.add('hidden');
            controls.classList.remove('hidden');
            fileInfoArea.classList.remove('hidden');

            if (fileOrUrl instanceof File) {
                fileNameDisplay.textContent = fileOrUrl.name;
            } else {
                fileNameDisplay.textContent = 'shared_image.webp';
            }

            outputFilename.value = generateDefaultFilename();
            updateCurrentBlob();
            hideLoading();
            showMessage('画像を読み込みました。');
        };
        img.onerror = () => {
            hideLoading();
            showMessage('画像の読み込みに失敗しました。');
        };

        if (typeof fileOrUrl === 'string') {
            img.src = fileOrUrl;
        } else {
            img.src = URL.createObjectURL(fileOrUrl);
        }
    }

    function updateCurrentBlob() {
        const quality = parseInt(webpQuality.value, 10) / 100;
        imageCanvas.toBlob(blob => {
            currentImageBlob = blob;
        }, 'image/webp', quality);
    }

    function enterCropMode() {
        cropOverlay.classList.remove('hidden');

        const rect = imageCanvas.getBoundingClientRect();
        const minDim = Math.min(rect.width, rect.height) * 0.8;
        cropRectWidth = minDim;
        cropRectHeight = minDim;
        cropRectX = (rect.width - minDim) / 2;
        cropRectY = (rect.height - minDim) / 2;
        updateCropRectStyle();

        cropOverlay.addEventListener('mousedown', startCrop);
        cropOverlay.addEventListener('mousemove', moveCrop);
        cropOverlay.addEventListener('mouseup', endCrop);
        cropOverlay.addEventListener('touchstart', startCrop, { passive: false });
        cropOverlay.addEventListener('touchmove', moveCrop, { passive: false });
        cropOverlay.addEventListener('touchend', endCrop);
    }

    function exitCropMode() {
        cropOverlay.classList.add('hidden');
        cropOverlay.removeEventListener('mousedown', startCrop);
        cropOverlay.removeEventListener('mousemove', moveCrop);
        cropOverlay.removeEventListener('mouseup', endCrop);
        cropOverlay.removeEventListener('touchstart', startCrop);
        cropOverlay.removeEventListener('touchmove', moveCrop);
        cropOverlay.removeEventListener('touchend', endCrop);
    }

    function updateCropRectStyle() {
        cropRect.style.width = `${cropRectWidth}px`;
        cropRect.style.height = `${cropRectHeight}px`;
        cropRect.style.left = `${cropRectX}px`;
        cropRect.style.top = `${cropRectY}px`;
    }

    function startCrop(e) {
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        cropStartX = touch.clientX - cropRectX;
        cropStartY = touch.clientY - cropRectY;
        cropRect.dataset.dragging = 'true';
    }

    function moveCrop(e) {
        e.preventDefault();
        if (cropRect.dataset.dragging !== 'true') return;
        const touch = e.touches ? e.touches[0] : e;
        cropRectX = touch.clientX - cropStartX;
        cropRectY = touch.clientY - cropStartY;
        updateCropRectStyle();
    }

    function endCrop() {
        delete cropRect.dataset.dragging;
    }

    applyCropButton.addEventListener('click', () => {
        showLoading('トリミング適用中...');
        exitCropMode();

        const canvasRect = imageCanvas.getBoundingClientRect();
        const scaleX = imageCanvas.width / canvasRect.width;
        const scaleY = imageCanvas.height / canvasRect.height;

        const sx = cropRectX * scaleX;
        const sy = cropRectY * scaleY;
        const sw = cropRectWidth * scaleX;
        const sh = cropRectHeight * scaleY;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(imageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

        imageCanvas.width = sw;
        imageCanvas.height = sh;
        ctx.clearRect(0, 0, sw, sh);
        ctx.drawImage(tempCanvas, 0, 0);

        updateCurrentBlob();
        hideLoading();
        showMessage('トリミングを適用しました。');
    });

    cancelCropButton.addEventListener('click', () => {
        exitCropMode();
        showMessage('トリミングをキャンセルしました。');
    });
});