document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const imageCanvas = document.getElementById('imageCanvas');
    const ctx = imageCanvas.getContext('2d');
    const imageInput = document.getElementById('imageInput');
    const selectImageButton = document.getElementById('selectImageButton');
    const dropZoneText = document.getElementById('dropZoneText');
    const controls = document.getElementById('controls');
    const convertToWebPButton = document.getElementById('convertToWebPButton');
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

    // トリミング用のDOM要素
    const cropOverlay = document.getElementById('cropOverlay');
    const cropRect = document.getElementById('cropRect');
    const applyCropButton = document.getElementById('applyCropButton');
    const cancelCropButton = document.getElementById('cancelCropButton');

    let originalImage = null; // 元画像 (Imageオブジェクト)
    let currentImageBlob = null; // 現在編集中の画像データ (Blob)
    let isCropping = false;
    let cropStartX, cropStartY;
    let cropRectX, cropRectY, cropRectWidth, cropRectHeight;

    // --- PWA Service Worker 登録 ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                    console.log('Service Worker registered with scope:', registration.scope);
                    // 共有ターゲットからの画像メッセージをリッスン
                    navigator.serviceWorker.addEventListener('message', event => {
                        if (event.data.type === 'shared-image' && event.data.file) {
                            console.log('Received shared image from service worker.');
                            displayImage(event.data.file);
                        }
                    });
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        });
    }

    // --- IndexedDB の設定 ---
    const DB_NAME = 'ImageEditorDB';
    const STORE_NAME = 'sharedImages';

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);

            request.onupgradeneeded = event => {
                const db = event.target.result;
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            };

            request.onsuccess = event => {
                resolve(event.target.result);
            };

            request.onerror = event => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async function saveImageToDB(file) {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put({ id: 'latestShared', file: file }); // 常に最新の共有画像を保存
        return new Promise(resolve => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = event => console.error('Save to DB failed:', event.target.error);
        });
    }

    async function getLatestImageFromDB() {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('latestShared');
        return new Promise(resolve => {
            request.onsuccess = event => resolve(event.target.result ? event.target.result.file : null);
            request.onerror = event => {
                console.error('Get from DB failed:', event.target.error);
                resolve(null);
            };
        });
    }

    // --- 初期表示時の共有画像チェック ---
    async function checkSharedImage() {
        const latestSharedFile = await getLatestImageFromDB();
        if (latestSharedFile) {
            console.log('Loading image from IndexedDB.');
            displayImage(latestSharedFile);
        } else {
            console.log('No shared image in IndexedDB.');
            showMessage('画像を読み込むか、共有機能から画像を送ってください。');
        }
    }
    checkSharedImage();

    // --- イベントリスナー ---

    // 画像選択ボタン
    selectImageButton.addEventListener('click', () => imageInput.click());

    // ファイル入力
    imageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            displayImage(file);
        } else {
            showMessage('有効な画像ファイルを選択してください。', 'error');
        }
    });

    // ドラッグ＆ドロップ
    imageArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        imageArea.classList.add('drag-over');
    });

    imageArea.addEventListener('dragleave', (event) => {
        event.preventDefault();
        imageArea.classList.remove('drag-over');
    });

    imageArea.addEventListener('drop', (event) => {
        event.preventDefault();
        imageArea.classList.remove('drag-over');
        const file = event.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            displayImage(file);
        } else {
            showMessage('有効な画像ファイルをドロップしてください。', 'error');
        }
    });

    // WebP画質スライダー
    webpQuality.addEventListener('input', () => {
        webpQualityValue.textContent = webpQuality.value;
    });

    // WebP変換ボタン
    convertToWebPButton.addEventListener('click', () => {
        if (!currentImageBlob) {
            showMessage('画像をロードしてください。', 'error');
            return;
        }
        showLoading('WebPに変換中...');
        canvasToBlob(imageCanvas, `image/webp`, parseFloat(webpQuality.value) / 100)
            .then(blob => {
                currentImageBlob = blob;
                // WebP変換後の再描画は不要。ただblobを更新する。
                showMessage(`WebP (${blob.size / 1024 / 1024} MB) に変換しました！`);
                hideLoading();
            })
            .catch(error => {
                console.error('WebP変換エラー:', error);
                showMessage('WebP変換中にエラーが発生しました。', 'error');
                hideLoading();
            });
    });

    // トリミングボタン
    trimButton.addEventListener('click', () => {
        if (!originalImage) return;
        enterCropMode();
    });

    // マスキングボタン (シンプルな円形マスクを実装)
    maskButton.addEventListener('click', () => {
        if (!originalImage) {
            showMessage('画像をロードしてください。', 'error');
            return;
        }
        showLoading('マスキング中...');

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageCanvas.width;
        tempCanvas.height = imageCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // 円形マスクの適用
        tempCtx.drawImage(originalImage, 0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.globalCompositeOperation = 'destination-in'; // 既存のコンテンツを残す
        tempCtx.beginPath();
        const centerX = tempCanvas.width / 2;
        const centerY = tempCanvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.8; // 中央に80%の円
        tempCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        tempCtx.fill();

        // Canvasに反映
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(tempCanvas, 0, 0);

        canvasToBlob(imageCanvas, 'image/png') // マスキングはPNGが適している
            .then(blob => {
                currentImageBlob = blob;
                showMessage('画像を円形にマスキングしました。');
                hideLoading();
            })
            .catch(error => {
                console.error('マスキングエラー:', error);
                showMessage('マスキング中にエラーが発生しました。', 'error');
                hideLoading();
            });
    });

    // リセットボタン
    resetButton.addEventListener('click', () => {
        if (!originalImage) return;
        showMessage('画像をリセット中...');
        displayImage(originalImage.src); // オリジナル画像のURLを再読み込み
    });

    // 保存ボタン
    saveButton.addEventListener('click', () => {
        if (!currentImageBlob) {
            showMessage('保存する画像がありません。', 'error');
            return;
        }

        const a = document.createElement('a');
        let filename = 'edited-image';
        let fileExtension = 'png';

        if (currentImageBlob.type.includes('webp')) {
            fileExtension = 'webp';
        } else if (currentImageBlob.type.includes('jpeg')) {
            fileExtension = 'jpeg';
        }

        a.href = URL.createObjectURL(currentImageBlob);
        a.download = `${filename}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showMessage('画像を保存しました！');
    });

    // 共有ボタン
    if (navigator.share) {
        shareButton.removeAttribute('disabled');
        shareButton.addEventListener('click', async () => {
            if (!currentImageBlob) {
                showMessage('共有する画像がありません。', 'error');
                return;
            }

            try {
                const filename = 'edited-image.png'; // 共有はPNGを推奨
                const file = new File([currentImageBlob], filename, { type: currentImageBlob.type });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'PWA画像エディタ',
                        text: 'PWAで編集した画像です！',
                    });
                    showMessage('画像を共有しました！');
                } else {
                    showMessage('このブラウザではファイルを共有できません。', 'error');
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    showMessage('共有がキャンセルされました。');
                } else {
                    console.error('共有エラー:', error);
                    showMessage('画像を共有できませんでした。', 'error');
                }
            }
        });
    } else {
        showMessage('お使いのブラウザはWeb Share APIに対応していません。', 'warning');
    }

    // --- 汎用関数 ---

    function showMessage(msg, type = 'info') {
        messageDisplay.textContent = msg;
        messageDisplay.className = `message ${type}`;
    }

    function showLoading(msg = '読み込み中...') {
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
            originalImage = img; // 元画像を保存
            const MAX_WIDTH = Math.min(window.innerWidth * 0.8, 800); // 最大幅を制限
            const MAX_HEIGHT = Math.min(window.innerHeight * 0.6, 600); // 最大高さを制限

            let width = img.width;
            let height = img.height;

            // アスペクト比を維持しつつリサイズ
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
            if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
            }

            imageCanvas.width = width;
            imageCanvas.height = height;
            ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
            ctx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
            imageCanvas.classList.remove('hidden');
            dropZoneText.classList.add('hidden');
            selectImageButton.classList.add('hidden');
            controls.classList.remove('hidden');

            canvasToBlob(imageCanvas, 'image/png') // 現在のcanvasの内容をBlobとして保存
                .then(blob => {
                    currentImageBlob = blob;
                    hideLoading();
                    showMessage('画像をロードしました。');
                })
                .catch(error => {
                    console.error('初期Blob生成エラー:', error);
                    showMessage('画像の読み込みに失敗しました。', 'error');
                    hideLoading();
                });
        };
        img.onerror = (e) => {
            console.error('画像の読み込みに失敗しました:', e);
            showMessage('画像の読み込みに失敗しました。', 'error');
            hideLoading();
        };

        if (typeof fileOrUrl === 'string') {
            img.src = fileOrUrl;
        } else if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
            img.src = URL.createObjectURL(fileOrUrl);
            saveImageToDB(fileOrUrl); // 共有された画像をIndexedDBに保存
        }
    }

    function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Canvas to Blob conversion failed.'));
                }
            }, type, quality);
        });
    }

    // --- トリミング機能 ---

    function enterCropMode() {
        if (!originalImage) return;

        // まず、元の画像をCanvasに描画し直す
        // これにより、編集履歴がリセットされ、元の画像からトリミングを開始できる
        imageCanvas.width = originalImage.width;
        imageCanvas.height = originalImage.height;
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(originalImage, 0, 0);


        isCropping = true;
        cropOverlay.classList.remove('hidden');
        imageCanvas.style.opacity = '0.5'; // キャンバスを薄くして、選択範囲を見やすくする

        // トリミング初期位置とサイズ (中央の正方形を初期選択)
        const minDim = Math.min(imageCanvas.width, imageCanvas.height);
        cropRectWidth = minDim * 0.8;
        cropRectHeight = minDim * 0.8;
        cropRectX = (imageCanvas.width - cropRectWidth) / 2;
        cropRectY = (imageCanvas.height - cropRectHeight) / 2;
        updateCropRectStyle();

        cropOverlay.addEventListener('mousedown', startCrop);
        cropOverlay.addEventListener('mousemove', moveCrop);
        cropOverlay.addEventListener('mouseup', endCrop);
        cropOverlay.addEventListener('touchstart', startCrop, { passive: false });
        cropOverlay.addEventListener('touchmove', moveCrop, { passive: false });
        cropOverlay.addEventListener('touchend', endCrop);
    }

    function exitCropMode() {
        isCropping = false;
        cropOverlay.classList.add('hidden');
        imageCanvas.style.opacity = '1';
        cropOverlay.removeEventListener('mousedown', startCrop);
        cropOverlay.removeEventListener('mousemove', moveCrop);
        cropOverlay.removeEventListener('mouseup', endCrop);
        cropOverlay.removeEventListener('touchstart', startCrop);
        cropOverlay.removeEventListener('touchmove', moveCrop);
        cropOverlay.removeEventListener('touchend', endCrop);
    }

    function getMouseOrTouchEventCoords(event, element) {
        const rect = element.getBoundingClientRect();
        let clientX, clientY;
        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function startCrop(event) {
        event.preventDefault();
        if (!isCropping) return;

        const coords = getMouseOrTouchEventCoords(event, cropOverlay);
        cropStartX = coords.x;
        cropStartY = coords.y;

        // cropRect の現在の位置を記録 (移動のため)
        const currentCropRect = cropRect.getBoundingClientRect();
        const overlayRect = cropOverlay.getBoundingClientRect();
        cropRectX = currentCropRect.left - overlayRect.left;
        cropRectY = currentCropRect.top - overlayRect.top;
        cropRectWidth = currentCropRect.width;
        cropRectHeight = currentCropRect.height;

        cropRect.dataset.dragging = true;
    }

    function moveCrop(event) {
        event.preventDefault();
        if (!isCropping || !cropRect.dataset.dragging) return;

        const coords = getMouseOrTouchEventCoords(event, cropOverlay);
        const dx = coords.x - cropStartX;
        const dy = coords.y - cropStartY;

        let newX = cropRectX + dx;
        let newY = cropRectY + dy;

        // トリミング範囲がCanvas内から出ないように制限
        const canvasRect = imageCanvas.getBoundingClientRect();
        const overlayRect = cropOverlay.getBoundingClientRect();

        const canvasRelativeLeft = canvasRect.left - overlayRect.left;
        const canvasRelativeTop = canvasRect.top - overlayRect.top;
        const canvasRelativeRight = canvasRelativeLeft + canvasRect.width;
        const canvasRelativeBottom = canvasRelativeTop + canvasRect.height;

        newX = Math.max(canvasRelativeLeft, Math.min(newX, canvasRelativeRight - cropRectWidth));
        newY = Math.max(canvasRelativeTop, Math.min(newY, canvasRelativeBottom - cropRectHeight));

        cropRect.style.left = `${newX}px`;
        cropRect.style.top = `${newY}px`;
    }

    function endCrop(event) {
        event.preventDefault();
        if (!isCropping || !cropRect.dataset.dragging) return;
        delete cropRect.dataset.dragging;

        // 最終的なトリミング範囲を更新
        const currentCropRect = cropRect.getBoundingClientRect();
        const overlayRect = cropOverlay.getBoundingClientRect();
        cropRectX = currentCropRect.left - overlayRect.left;
        cropRectY = currentCropRect.top - overlayRect.top;
    }

    function updateCropRectStyle() {
        const canvasRect = imageCanvas.getBoundingClientRect();
        const overlayRect = cropOverlay.getBoundingClientRect();

        // Canvasの位置を基準にトリミング矩形の位置を計算
        // Canvasの左上を(0,0)とした場合の、overlay内の相対座標
        const canvasLeftInOverlay = canvasRect.left - overlayRect.left;
        const canvasTopInOverlay = canvasRect.top - overlayRect.top;

        cropRect.style.left = `${canvasLeftInOverlay + cropRectX}px`;
        cropRect.style.top = `${canvasTopInOverlay + cropRectY}px`;
        cropRect.style.width = `${cropRectWidth}px`;
        cropRect.style.height = `${cropRectHeight}px`;
    }

    applyCropButton.addEventListener('click', () => {
        showLoading('トリミング適用中...');
        exitCropMode();

        // CanvasのgetBoundingClientRect()とimageCanvasの実際の幅/高さの比率を考慮
        // overlayとcanvasの間のスケール差を調整
        const canvasDisplayRect = imageCanvas.getBoundingClientRect();
        const originalImageWidth = originalImage.width;
        const originalImageHeight = originalImage.height;

        const scaleX = originalImageWidth / canvasDisplayRect.width;
        const scaleY = originalImageHeight / canvasDisplayRect.height;

        const croppedX = (cropRectX - (canvasDisplayRect.left - cropOverlay.getBoundingClientRect().left)) * scaleX;
        const croppedY = (cropRectY - (canvasDisplayRect.top - cropOverlay.getBoundingClientRect().top)) * scaleY;
        const croppedWidth = cropRectWidth * scaleX;
        const croppedHeight = cropRectHeight * scaleY;

        // 新しいキャンバスを作成してトリミング画像を格納
        const newCanvas = document.createElement('canvas');
        newCanvas.width = croppedWidth;
        newCanvas.height = croppedHeight;
        const newCtx = newCanvas.getContext('2d');

        newCtx.drawImage(
            originalImage,
            croppedX,
            croppedY,
            croppedWidth,
            croppedHeight,
            0,
            0,
            croppedWidth,
            croppedHeight
        );

        // メインキャンバスを新しい画像に更新
        imageCanvas.width = newCanvas.width;
        imageCanvas.height = newCanvas.height;
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(newCanvas, 0, 0);

        canvasToBlob(imageCanvas, 'image/png')
            .then(blob => {
                currentImageBlob = blob;
                showMessage('画像をトリミングしました。');
                hideLoading();
            })
            .catch(error => {
                console.error('トリミング適用エラー:', error);
                showMessage('トリミング適用中にエラーが発生しました。', 'error');
                hideLoading();
            });
    });

    cancelCropButton.addEventListener('click', () => {
        exitCropMode();
        showMessage('トリミングをキャンセルしました。');
    });

    // 初期化
    // アプリがロードされたときに共有された画像があるか確認
    // checkSharedImage() は DOMContentLoaded の中で既に呼び出されているため不要
});