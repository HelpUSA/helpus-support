/**
 * Utility to compress images in browser using HTML5 Canvas
 * Reduces large images (e.g. 15MB PNG/JPG) to a high-quality ~200KB-500KB JPEG
 */

export interface CompressedImageResult {
  id: string;
  name: string;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  type: string;
}

export function compressImage(file: File, maxWidth = 1920, maxHeight = 1080, quality = 0.8): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    // If not an image (e.g. PDF), read as DataURL directly
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve({
          id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          dataUrl: result,
          originalSize: file.size,
          compressedSize: file.size,
          type: file.type,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate ratio
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Export as JPEG with quality
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      
      // Calculate approximate size in bytes of base64 string
      const head = 'data:image/jpeg;base64,';
      const compressedSizeBytes = Math.round(((compressedDataUrl.length - head.length) * 3) / 4);

      resolve({
        id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: file.name || `captura_${new Date().toISOString().slice(0, 10)}.jpg`,
        dataUrl: compressedDataUrl,
        originalSize: file.size,
        compressedSize: compressedSizeBytes,
        type: 'image/jpeg',
      });
    };

    img.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
