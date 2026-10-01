document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const selectBtn = document.getElementById('selectBtn');
  const editorContainer = document.getElementById('editorContainer');
  const canvas = document.getElementById('imageCanvas');
  const ctx = canvas.getContext('2d');
  const qualityRange = document.getElementById('qualityRange');
  const qualityVal = document.getElementById('qualityVal');
  const resetBtn = document.getElementById('resetBtn');
  const convertBtn = document.getElementById('convertBtn');
  const fileInfo = document.getElementById('fileInfo');

  let img = new Image();
  let originalFile = null;
  
  // Crop state variables
  let isDragging = false;
  let startX, startY, endX, endY;
  let cropRect = { x: 0, y: 0, width: 0, height: 0 };

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
    });
  }

  // Handle Share Target parameters (GET)
  window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const imageParam = params.get('image'); // if passed via share target url
    if (imageParam) {
      // Fetch if needed, or handle cache
    }
  });

  // Also check if files were shared via POST Share Target (using IndexedDB or caches API in real scenarios, simplified here via File handling if available)
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
    
    // Default crop area is full image
    cropRect = { x: 0, y: 0, width: img.width, height: img.height };
    drawCanvas();
    updateFileInfo();
  }

  function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // Draw crop overlay if dragging or cropped
    if (cropRect.width > 0 && cropRect.height > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.beginPath();
      ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      ctx.clip();
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      // Border around crop rect
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = Math.max(2, canvas.width / 200);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    }
  }

  // Mouse / Touch events for cropping
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

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;
    cropRect = { x: startX, y: startY, width: 0, height: 0 };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const coords = getCanvasCoords(e);
    endX = coords.x;
    endY = coords.y;

    let x = Math.min(startX, endX);
    let y = Math.min(startY, endY);
    let width = Math.abs(endX - startX);
    let height = Math.abs(endY - startY);

    // Boundary checks
    x = Math.max(0, Math.min(x, canvas.width));
    y = Math.max(0, Math.min(y, canvas.height));
    width = Math.min(width, canvas.width - x);
    height = Math.min(height, canvas.height - y);

    cropRect = { x, y, width, height };
    drawCanvas();
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    if (cropRect.width < 10 || cropRect.height < 10) {
      // Reset to full if too small
      cropRect = { x: 0, y: 0, width: img.width, height: img.height };
      drawCanvas();
    }
    updateFileInfo();
  });

  // Touch support
  canvas.addEventListener('touchstart', (e) => {
    isDragging = true;
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;
    cropRect = { x: startX, y: startY, width: 0, height: 0 };
    e.preventDefault();
  });

  canvas.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
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
    e.preventDefault();
  });

  window.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    if (cropRect.width < 10 || cropRect.height < 10) {
      cropRect = { x: 0, y: 0, width: img.width, height: img.height };
      drawCanvas();
    }
    updateFileInfo();
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
  });

  function updateFileInfo() {
    if (!originalFile) return;
    const originalSizeFormatted = formatBytes(originalFile.size);
    
    // Estimate WebP size using canvas export
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