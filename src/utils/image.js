/** Longest side of a photo sent to the API: enough to read a label or a document, light on mobile data */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.8;

/**
 * Shrinks a photo from the camera or gallery to a JPEG of at most MAX_SIDE pixels on its longest side, upright and
 * without its metadata (like the location). Falls back to the original file when the browser can't decode it.
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 */
export async function shrinkPhoto(file) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        return file;
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return blob ?? file;
}
