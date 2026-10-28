document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const selectBtn = document.getElementById('selectBtn');
  const editorContainer = document.getElementById('editorContainer');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const canvas = document.getElementById('imageCanvas');
  const ctx = canvas.getContext('2d');
  const qualityRange = document.getElementById('qualityRange');
  const qualityVal = document.getElementById('qualityVal');
  const resetBtn = document.getElementById('resetBtn');
  const convertBtn = document.getElementById('convertBtn');
  const fileInfo = document.getElementById('fileInfo');
  const modeCrop = document.getElementById('modeCrop');
  const modePan = document.getElementById('modePan');

  let img = new Image();
  let originalFile = null;
  
  // App mode: 'crop' or 'pan'
  let currentMode = 'crop';

  // Transform state for Pan/Zoom
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startPanX = 0;
  let startPanY = 0;

  // Pinch zoom variables
  let initialPinchDistance = null;
  let initialScale = 1;

  // Crop state variables
  let isDragging = false;
  let startX, startY, endX, endY;
  let cropRect = { x: 0, y: 0, width: 0, height: 0 };

  // Mode switching
  modeCrop.addEventListener('click', () => {
    currentMode = 'crop';
    modeCrop.classList.add('active');
    modePan.classList.remove('active');
    canvas.style.cursor = 'crosshair';
  });

  modePan.addEventListener('click', () => {
    currentMode = 'pan';
    modePan.classList.add('active');
    modeCrop.classList.remove('active');
    canvas.style.cursor = 'grab';
  });

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        console.log('ServiceWorker registration successful', reg.scope);
      }).catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'shared-image' && event.data.file) {
        loadImageFile(event.data.file);
      }
    });
  }

  checkIndexedDBForSharedImage();

  async function checkIndexedDBForSharedImage() {
    try {
      const db = await openDB();
      const tx = db.transaction('sharedImages', 'readonly');
      const store = tx.objectStore('sharedImages');
      const request = store.get('latestShared');
      request.onsuccess = () => {
        if (request.result && request.result.file) {
          if (Date.now() - request.result.timestamp < 60000) {
            loadImageFile(request.result.file);
            clearSharedImage();
          }
        }
      };
    } catch (e) {
      console.log('No shared image in DB or DB error:', e);
    }
  }

  function clearSharedImage() {
    indexedDB.open('ImageEditorDB', 1).onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('sharedImages', 'readwrite');
      tx.objectStore('sharedImages').delete('latestShared');
    };
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ImageEditorDB', 1);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('sharedImages')) {
          db.createObjectStore('sharedImages', { keyPath: 'id' });
        }
      };
      request.onsuccess = event => resolve(event.target.result);
      request.onerror = event => reject(event.target.error);
    });
  }

  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files || launchParams.files.length === 0) {
        return;
      }
      for (const fileHandle of launchParams.files) {
        const file = await fileHandle.getFile();
        loadImageFile(file);
        break;
      }
    });
  }

  selectBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      loadImageFile(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadImageFile(e.dataTransfer.files[0]);
    }
  });

  function loadImageFile(file) {
    originalFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        dropzone.classList.add('hidden');
        editorContainer.classList.remove('hidden');
        initCanvas();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function initCanvas() {
    canvas.width = img.width;
    canvas.height = img.height;
    
    scale = 1;
    panX = 0;
    panY = 0;
    cropRect = { x: 0, y: 0, width: img.width, height: img.height };
    
    updateCanvasTransform();
    drawCanvas();
    updateFileInfo();
  }

  function updateCanvasTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    if (cropRect.width > 0 && cropRect.height > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.beginPath();
      ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      ctx.clip();
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = Math.max(2, canvas.width / 200);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    }
  }

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  // Mouse Wheel Zoom
  canvasWrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    if (e.deltaY < 0) {
      scale = Math.min(scale * (1 + zoomIntensity), 5);
    } else {
      scale = Math.max(scale * (1 - zoomIntensity), 0.5);
    }
    updateCanvasTransform();
  }, { passive: false });

  // Pointer / Touch Events handling
  canvas.addEventListener('mousedown', (e) => {
    if (currentMode === 'pan') {
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
      canvas.style.cursor = 'grabbing';
    } else {
      isDragging = true;
      const coords = getCanvasCoords(e);
      startX = coords.x;
      startY = coords.y;
      cropRect = { x: startX, y: startY, width: 0, height: 0 };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panX = e.clientX - startPanX;
      panY = e.clientY - startPanY;
      updateCanvasTransform();
    } else if (isDragging) {
      const coords = getCanvasCoords(e);
      endX = coords.x;
      endY = coords.y;

      let x = Math.min(startX, endX);
      let y = Math.min(startY, endY);
      let width = Math.abs(endX - startX);
      let height = Math.abs(endY - startY);

      x = Math.max(0, Math.min(x, canvas.width));
      y = Math.max(0, Math.min(y, canvas.height));
      width = Math.min(width, canvas.width - x);
      height = Math.min(height, canvas.height - y);

      cropRect = { x, y, width, height };
      drawCanvas();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = currentMode === 'pan' ? 'grab' : 'crosshair';
    }
    if (isDragging) {
      isDragging = false;
      if (cropRect.width < 10 || cropRect.height < 10) {
        cropRect = { x: 0, y: 0, width: img.width, height: img.height };
        drawCanvas();
      }
      updateFileInfo();
    }
  });

  // Touch Events for Mobile Pinch & Crop/Pan
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      // Pinch start
      initialPinchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialScale = scale;
      isDragging = false;
      isPanning = false;
    } else if (e.touches.length === 1) {
      if (currentMode === 'pan') {
        isPanning = true;
        startPanX = e.touches[0].clientX - panX;
        startPanY = e.touches[0].clientY - panY;
      } else {
        isDragging = true;
        const coords = getCanvasCoords(e);
        startX = coords.x;
        startY = coords.y;
        cropRect = { x: startX, y: startY, width: 0, height: 0 };
      }
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance !== null) {
      // Pinch zoom
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = currentDistance / initialPinchDistance;
      scale = Math.min(Math.max(initialScale * factor, 0.5), 5);
      updateCanvasTransform();
    } else if (e.touches.length === 1) {
      if (isPanning) {
        panX = e.touches[0].clientX - startPanX;
        panY = e.touches[0].clientY - startPanY;
        updateCanvasTransform();
      } else if (isDragging) {
        const coords = getCanvasCoords(e);
        endX = coords.x;
        endY = coords.y;

        let x = Math.min(startX, endX);
        let y = Math.min(startY, endY);
        let width = Math.abs(endX - startX);
        let height = Math.abs(endY - startY);

        x = Math.max(0, Math.min(x, canvas.width));
        y = Math.max(0, Math.min(y, canvas.height));
        width = Math.min(width, canvas.width - x);
        height = Math.min(height, canvas.height - y);

        cropRect = { x, y, width, height };
        drawCanvas();
      }
    }
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      initialPinchDistance = null;
    }
    if (isPanning) {
      isPanning = false;
    }
    if (isDragging) {
      isDragging = false;
      if (cropRect.width < 10 || cropRect.height < 10) {
        cropRect = { x: 0, y: 0, width: img.width, height: img.height };
        drawCanvas();
      }
      updateFileInfo();
    }
  });

  qualityRange.addEventListener('input', (e) => {
    qualityVal.textContent = e.target.value;
    updateFileInfo();
  });

  resetBtn.addEventListener('click', () => {
    editorContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
    fileInput.value = '';
    originalFile = null;
    scale = 1;
    panX = 0;
    panY = 0;
    updateCanvasTransform();
  });

  function updateFileInfo() {
    if (!originalFile) return;
    const originalSizeFormatted = formatBytes(originalFile.size);
    const quality = parseInt(qualityRange.value) / 100;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropRect.width || img.width;
    tempCanvas.height = cropRect.height || img.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    const srcX = cropRect.width ? cropRect.x : 0;
    const srcY = cropRect.height ? cropRect.y : 0;
    const srcW = cropRect.width || img.width;
    const srcH = cropRect.height || img.height;

    tempCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, tempCanvas.width, tempCanvas.height);
    
    tempCanvas.toBlob((blob) => {
      if (blob) {
        fileInfo.textContent = `元サイズ: ${originalSizeFormatted} / 予想 WebP: ${formatBytes(blob.size)}`;
      }
    }, 'image/webp', quality);
  }

  convertBtn.addEventListener('click', () => {
    const quality = parseInt(qualityRange.value) / 100;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropRect.width || img.width;
    tempCanvas.height = cropRect.height || img.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    const srcX = cropRect.width ? cropRect.x : 0;
    const srcY = cropRect.height ? cropRect.y : 0;
    const srcW = cropRect.width || img.width;
    const srcH = cropRect.height || img.height;

    tempCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, tempCanvas.width, tempCanvas.height);
    
    tempCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const originalName = originalFile ? originalFile.name.substring(0, originalFile.name.lastIndexOf('.')) || originalFile.name : 'image';
      a.download = `${originalName}_converted.webp`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/webp', quality);
  });

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
});