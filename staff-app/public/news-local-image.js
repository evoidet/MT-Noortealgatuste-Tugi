// Browser-only preparation and local saving for the Add News form.
export const NEWS_IMAGE_LIMITS = Object.freeze({
  maxBytes: 25 * 1024 * 1024,
  maxPixels: 40_000_000,
  width: 1200,
  height: 750,
  minAspect: 1.49,
  maxAspect: 1.61
});

export class NewsImageError extends Error {
  constructor(code) {
    super(code);
    this.name = "NewsImageError";
    this.code = code;
  }
}

function invalidImage() {
  throw new NewsImageError("invalid-image");
}

function checkDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) invalidImage();
  if (width * height > NEWS_IMAGE_LIMITS.maxPixels) throw new NewsImageError("image-too-large");
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

// Return 0 for unrecognized EXIF, so uncertain orientation is normalized, never passed through.
function exifOrientation(bytes) {
  const offset = ascii(bytes, 0, 6) === "Exif\0\0" ? 6 : 0;
  if (bytes.length < offset + 8) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
  const order = ascii(bytes, offset, 2);
  if (order !== "II" && order !== "MM") return 0;
  const little = order === "II";
  if (view.getUint16(2, little) !== 42) return 0;
  const directory = view.getUint32(4, little);
  if (directory < 8 || directory + 2 > view.byteLength) return 0;
  const count = view.getUint16(directory, little);
  if (directory + 2 + count * 12 > view.byteLength) return 0;
  for (let index = 0; index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (view.getUint16(entry, little) !== 0x112) continue;
    if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return 0;
    const orientation = view.getUint16(entry + 8, little);
    return orientation >= 1 && orientation <= 8 ? orientation : 0;
  }
  return 1;
}

function inspectImage(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let orientation = 1;
  let animated = false;
  let extension;
  if (bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) {
    extension = "gif";
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else if (bytes.length >= 26 && ascii(bytes, 0, 2) === "BM") {
    extension = "bmp";
    const headerSize = view.getUint32(14, true);
    if (14 + headerSize > bytes.length) invalidImage();
    if (headerSize === 12) {
      // The older BITMAPCOREHEADER stores unsigned 16-bit dimensions.
      width = view.getUint16(18, true);
      height = view.getUint16(20, true);
    } else if (headerSize >= 40) {
      width = view.getInt32(18, true);
      // A negative height denotes a top-down Windows bitmap.
      height = Math.abs(view.getInt32(22, true));
    } else {
      invalidImage();
    }
  } else if (bytes.length >= 24 && ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") {
    extension = "png";
    if (view.getUint32(8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") invalidImage();
    width = view.getUint32(16);
    height = view.getUint32(20);
    checkDimensions(width, height);
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) invalidImage();
      const chunk = ascii(bytes, offset + 4, 4);
      if (chunk === "eXIf") orientation = exifOrientation(bytes.subarray(offset + 8, end - 4));
      if (chunk === "acTL") animated = true;
      offset = end;
      if (chunk === "IEND") break;
    }
  } else if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    extension = "webp";
    const end = view.getUint32(4, true) + 8;
    if (end > bytes.length || end < 20) invalidImage();
    for (let offset = 12; offset + 8 <= end;) {
      const chunk = ascii(bytes, offset, 4);
      const length = view.getUint32(offset + 4, true);
      const start = offset + 8;
      if (start + length > end) invalidImage();
      let chunkWidth = 0;
      let chunkHeight = 0;
      if (chunk === "VP8X" && length >= 10) {
        animated = Boolean(bytes[start] & 2);
        chunkWidth = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
        chunkHeight = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
      } else if (chunk === "VP8 " && length >= 10) {
        if (ascii(bytes, start + 3, 3) !== "\x9d\x01\x2a") invalidImage();
        chunkWidth = view.getUint16(start + 6, true) & 0x3fff;
        chunkHeight = view.getUint16(start + 8, true) & 0x3fff;
      } else if (chunk === "VP8L" && length >= 5) {
        if (bytes[start] !== 0x2f) invalidImage();
        const packed = view.getUint32(start + 1, true);
        chunkWidth = (packed & 0x3fff) + 1;
        chunkHeight = ((packed >>> 14) & 0x3fff) + 1;
      } else if (chunk === "EXIF") {
        orientation = exifOrientation(bytes.subarray(start, start + length));
      }
      if (chunkWidth || chunkHeight) {
        checkDimensions(chunkWidth, chunkHeight);
        // The extended header describes the complete canvas, including animation.
        if (!width) { width = chunkWidth; height = chunkHeight; }
      }
      offset = start + length + (length % 2);
    }
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    extension = "jpg";
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) invalidImage();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) invalidImage();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) invalidImage();
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) invalidImage();
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        checkDimensions(width, height);
      }
      if (marker === 0xe1 && ascii(bytes, offset + 2, 6) === "Exif\0\0") {
        orientation = exifOrientation(bytes.subarray(offset + 2, offset + length));
      }
      offset += length;
    }
  } else {
    throw new NewsImageError("unsupported-image");
  }
  checkDimensions(width, height);
  return { width, height, extension, orientation, animated };
}

function encodeCanvas(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new NewsImageError("invalid-image")), type, quality);
  });
}

/** Prepare one raster image in the browser; conforming JPEG/PNG/WebP files retain their original bytes. */
export async function prepareNewsImage(file, dependencies = {}) {
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) invalidImage();
  if (file.size > NEWS_IMAGE_LIMITS.maxBytes) throw new NewsImageError("image-too-large");
  const metadata = inspectImage(new Uint8Array(await file.arrayBuffer()));
  const decode = dependencies.decode || globalThis.createImageBitmap?.bind(globalThis);
  if (!decode) throw new NewsImageError("browser-unsupported");
  let bitmap;
  try {
    bitmap = await decode(file, { imageOrientation: "from-image" });
  } catch {
    invalidImage();
  }
  try {
    const { width, height } = bitmap;
    checkDimensions(width, height);
    const aspect = width / height;
    if (["jpg", "png", "webp"].includes(metadata.extension) &&
        width >= NEWS_IMAGE_LIMITS.width && height >= NEWS_IMAGE_LIMITS.height &&
        aspect >= NEWS_IMAGE_LIMITS.minAspect && aspect <= NEWS_IMAGE_LIMITS.maxAspect &&
        metadata.orientation === 1 && !metadata.animated) {
      return { blob: file, extension: metadata.extension, width, height, unchanged: true };
    }
    const canvas = dependencies.createCanvas ? dependencies.createCanvas() : globalThis.document?.createElement("canvas");
    const context = canvas?.getContext("2d");
    if (!context) throw new NewsImageError("browser-unsupported");
    canvas.width = NEWS_IMAGE_LIMITS.width;
    canvas.height = NEWS_IMAGE_LIMITS.height;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const targetAspect = canvas.width / canvas.height;
    const cropWidth = Math.min(width, height * targetAspect);
    const cropHeight = Math.min(height, width / targetAspect);
    context.drawImage(bitmap, (width - cropWidth) / 2, (height - cropHeight) / 2,
      cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    let blob = await encodeCanvas(canvas, "image/webp", 0.9);
    let extension = "webp";
    if (blob.type !== "image/webp") {
      // Browsers return PNG when an encoder is unavailable; do not give it a WebP filename.
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      blob = await encodeCanvas(canvas, "image/jpeg", 0.92);
      extension = "jpg";
      if (blob.type !== "image/jpeg") throw new NewsImageError("browser-unsupported");
    }
    return { blob, extension, width: canvas.width, height: canvas.height, unchanged: false };
  } finally {
    bitmap.close?.();
  }
}

/** The user selects assets/news. Only its uploads child is accessed; no other project files are read. */
export async function saveNewsImageToDirectory(directory, prepared, dependencies = {}) {
  if (directory?.kind !== "directory" || directory.name !== "news") throw new NewsImageError("folder-invalid");
  if (!prepared?.blob || !["jpg", "png", "webp"].includes(prepared.extension)) invalidImage();
  const randomUUID = dependencies.randomUUID || globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!randomUUID) throw new NewsImageError("browser-unsupported");
  const uploads = await directory.getDirectoryHandle("uploads", { create: true });
  let filename;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) invalidImage();
    const candidate = `news-${id}.${prepared.extension}`;
    try {
      await uploads.getFileHandle(candidate);
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
      filename = candidate;
      break;
    }
  }
  if (!filename) throw new NewsImageError("save-collision");
  const handle = await uploads.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(prepared.blob);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => {});
    throw error;
  }
  return { filename, path: `/assets/news/uploads/${filename}` };
}
