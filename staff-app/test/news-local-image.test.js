import assert from "node:assert/strict";
import test from "node:test";
import { NEWS_IMAGE_LIMITS, prepareNewsImage, saveNewsImageToDirectory } from "../public/news-local-image.js";

function png(width, height, type = "image/png") {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(Buffer.from("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set(Buffer.from("IEND"), 37);
  return new Blob([bytes], { type });
}

function jpeg(width, height, orientation = 1) {
  const bytes = new Uint8Array(50);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8, 0xff, 0xe1]);
  view.setUint16(4, 34);
  bytes.set(Buffer.from("Exif\0\0II"), 6);
  view.setUint16(14, 42, true);
  view.setUint32(16, 8, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 0x112, true);
  view.setUint16(24, 3, true);
  view.setUint32(26, 1, true);
  view.setUint16(30, orientation, true);
  bytes.set([0xff, 0xc0], 38);
  view.setUint16(40, 8);
  bytes[42] = 8;
  view.setUint16(43, height);
  view.setUint16(45, width);
  bytes.set([0xff, 0xd9], 48);
  return new Blob([bytes], { type: "image/jpeg" });
}

function webp(width, height, chunk = "VP8X") {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set(Buffer.from("RIFF"));
  view.setUint32(4, 22, true);
  bytes.set(Buffer.from(`WEBP${chunk}`), 8);
  view.setUint32(16, 10, true);
  if (chunk === "VP8X") {
    view.setUint32(24, width - 1, true);
    for (let index = 0; index < 3; index++) bytes[27 + index] = ((height - 1) >>> (index * 8)) & 255;
  } else if (chunk === "VP8L") {
    bytes[20] = 0x2f;
    view.setUint32(21, ((height - 1) << 14) | (width - 1), true);
  } else {
    bytes.set([0x9d, 0x01, 0x2a], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  }
  return new Blob([bytes], { type: "image/webp" });
}

function gif(width, height) {
  const bytes = new Uint8Array(13);
  bytes.set(Buffer.from("GIF89a"));
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return new Blob([bytes], { type: "image/gif" });
}

function bmp(width, height, headerSize = 40) {
  const bytes = new Uint8Array(14 + headerSize);
  bytes.set(Buffer.from("BM"));
  const view = new DataView(bytes.buffer);
  view.setUint32(14, headerSize, true);
  if (headerSize === 12) {
    view.setUint16(18, width, true);
    view.setUint16(20, height, true);
  } else {
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
  }
  return new Blob([bytes], { type: "image/bmp" });
}

test("GIF and BMP always convert to a website image format even at conforming dimensions", async () => {
  for (const file of [gif(1200, 750), bmp(1200, 750), bmp(1200, -750), bmp(1200, 750, 12)]) {
    const { dependencies, calls } = browser(1200, 750);
    const result = await prepareNewsImage(file, dependencies);
    assert.equal(result.unchanged, false);
    assert.equal(result.extension, "webp");
    assert.equal(result.blob.type, "image/webp");
    assert.equal(calls.encodes.length, 1);
  }
});

function browser(width, height, encodeTypes = ["image/webp"]) {
  const calls = { closed: 0, decoded: 0, drawn: null, encodes: [], background: null };
  const bitmap = { width, height, close() { calls.closed++; } };
  const context = {
    drawImage(...args) { calls.drawn = args; },
    fillRect(...args) { calls.background = args; }
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => context,
    toBlob(callback, type, quality) {
      calls.encodes.push({ type, quality });
      callback(new Blob(["encoded fixture"], { type: encodeTypes.shift() || type }));
    }
  };
  return {
    calls, context,
    dependencies: {
      decode: async (_file, options) => {
        calls.decoded++;
        assert.equal(options.imageOrientation, "from-image");
        return bitmap;
      },
      createCanvas: () => canvas
    }
  };
}

test("conforming JPEG, PNG and all WebP headers preserve the exact input without encoding", async () => {
  for (const [file, extension] of [[png(1600, 1000), "png"], [jpeg(1600, 1000), "jpg"],
    ...["VP8X", "VP8L", "VP8 "].map((chunk) => [webp(1600, 1000, chunk), "webp"])]) {
    const { dependencies, calls } = browser(1600, 1000);
    const result = await prepareNewsImage(file, dependencies);
    assert.equal(result.blob, file);
    assert.equal(result.extension, extension);
    assert.equal(result.unchanged, true);
    assert.equal(calls.closed, 1);
    assert.equal(calls.encodes.length, 0);
  }
});

test("format is determined from bytes rather than a filename or MIME hint", async () => {
  const file = png(1200, 750, "image/jpeg");
  assert.equal((await prepareNewsImage(file, browser(1200, 750).dependencies)).extension, "png");
  await assert.rejects(prepareNewsImage(new Blob(["<svg></svg>"], { type: "image/png" })), { code: "unsupported-image" });
});

test("current site aspect tolerance is preserved without needless recompression", async () => {
  for (const width of [1490, 1600, 1610]) {
    const result = await prepareNewsImage(png(width, 1000), browser(width, 1000).dependencies);
    assert.equal(result.unchanged, true);
  }
  for (const width of [1489, 1611]) {
    const result = await prepareNewsImage(png(width, 1000), browser(width, 1000).dependencies);
    assert.equal(result.unchanged, false);
  }
});

test("portrait and wide images are cropped from their center at high quality", async () => {
  for (const [width, height, expected] of [[800, 1200, [0, 350, 800, 500]], [2000, 1000, [200, 0, 1600, 1000]]]) {
    const { dependencies, calls, context } = browser(width, height);
    const result = await prepareNewsImage(png(width, height), dependencies);
    assert.deepEqual(calls.drawn.slice(1), [...expected, 0, 0, 1200, 750]);
    assert.equal(context.imageSmoothingEnabled, true);
    assert.equal(context.imageSmoothingQuality, "high");
    assert.deepEqual(calls.encodes, [{ type: "image/webp", quality: 0.9 }]);
    assert.equal(result.extension, "webp");
    assert.equal(result.width, 1200);
    assert.equal(result.height, 750);
    assert.equal(result.unchanged, false);
    assert.equal(calls.closed, 1);
  }
});

test("undersized images are enlarged even if the aspect ratio is correct", async () => {
  const { dependencies, calls } = browser(640, 400);
  assert.equal((await prepareNewsImage(png(640, 400), dependencies)).unchanged, false);
  assert.deepEqual(calls.drawn.slice(1), [0, 0, 640, 400, 0, 0, 1200, 750]);
});

test("EXIF-oriented JPEGs are normalized even when decoded dimensions already conform", async () => {
  for (const orientation of [0, 2, 3, 4, 5, 6, 7, 8]) {
    const { dependencies, calls } = browser(1200, 750);
    assert.equal((await prepareNewsImage(jpeg(750, 1200, orientation), dependencies)).unchanged, false);
    assert.equal(calls.encodes.length, 1);
  }
});

test("oversized files and declared image dimensions are rejected before decoding", async () => {
  let decoded = false;
  const dependencies = { decode: async () => { decoded = true; } };
  const largeFile = { size: NEWS_IMAGE_LIMITS.maxBytes + 1, arrayBuffer: () => assert.fail("must not read oversized file") };
  await assert.rejects(prepareNewsImage(largeFile, dependencies), { code: "image-too-large" });
  for (const file of [png(10_000, 10_000), jpeg(10_000, 10_000), webp(10_000, 10_000), gif(10_000, 10_000), bmp(10_000, -10_000)]) {
    await assert.rejects(prepareNewsImage(file, dependencies), { code: "image-too-large" });
  }
  assert.equal(decoded, false);
});

test("corrupt data and invalid decoded dimensions cannot be saved as unchanged files", async () => {
  await assert.rejects(prepareNewsImage(new Blob()), { code: "invalid-image" });
  await assert.rejects(prepareNewsImage(png(0, 750)), { code: "invalid-image" });
  await assert.rejects(prepareNewsImage(png(1200, 750), { decode: async () => { throw new Error("decode failed"); } }), { code: "invalid-image" });
  const huge = browser(10_000, 10_000);
  await assert.rejects(prepareNewsImage(png(1200, 750), huge.dependencies), { code: "image-too-large" });
  assert.equal(huge.calls.closed, 1);
});

test("encoder fallback uses the actual JPEG extension and a white transparency background", async () => {
  const { dependencies, calls, context } = browser(640, 400, ["image/png", "image/jpeg"]);
  const result = await prepareNewsImage(png(640, 400), dependencies);
  assert.equal(result.extension, "jpg");
  assert.equal(result.blob.type, "image/jpeg");
  assert.equal(context.globalCompositeOperation, "destination-over");
  assert.equal(context.fillStyle, "#ffffff");
  assert.deepEqual(calls.background, [0, 0, 1200, 750]);
  assert.deepEqual(calls.encodes, [{ type: "image/webp", quality: 0.9 }, { type: "image/jpeg", quality: 0.92 }]);
  const unsupported = browser(640, 400, ["image/png", "image/png"]);
  await assert.rejects(prepareNewsImage(png(640, 400), unsupported.dependencies), { code: "browser-unsupported" });
  assert.equal(unsupported.calls.closed, 1);
});

function folder({ existing = [], failWrite = false, denyLookup = false } = {}) {
  const files = new Map(existing.map((name) => [name, "existing image"]));
  const calls = { directory: [], aborted: 0, writes: 0 };
  const directory = {
    kind: "directory", name: "news",
    async getDirectoryHandle(name, options) {
      calls.directory.push({ name, options });
      return {
        async getFileHandle(filename, options) {
          if (denyLookup) throw new DOMException("Permission denied", "NotAllowedError");
          if (!options?.create && !files.has(filename)) throw new DOMException("Not found", "NotFoundError");
          return {
            async createWritable() {
              let pending;
              return {
                async write(blob) { calls.writes++; if (failWrite) throw new Error("disk full"); pending = blob; },
                async close() { files.set(filename, pending); },
                async abort() { calls.aborted++; }
              };
            }
          };
        }
      };
    }
  };
  return { directory, calls, files };
}

const firstUUID = "11111111-1111-4111-8111-111111111111";
const secondUUID = "22222222-2222-4222-8222-222222222222";

test("local saving accesses only news/uploads and retries collisions without overwriting", async () => {
  const existingName = `news-${firstUUID}.png`;
  const { directory, calls, files } = folder({ existing: [existingName] });
  const ids = [firstUUID, secondUUID];
  const blob = png(1200, 750);
  const result = await saveNewsImageToDirectory(directory, { blob, extension: "png" }, { randomUUID: () => ids.shift() });
  assert.deepEqual(result, { filename: `news-${secondUUID}.png`, path: `/assets/news/uploads/news-${secondUUID}.png` });
  assert.deepEqual(calls.directory, [{ name: "uploads", options: { create: true } }]);
  assert.equal(files.get(existingName), "existing image");
  assert.equal(files.get(result.filename), blob);
  assert.equal(calls.writes, 1);
});

test("invalid folders and repeated collisions cannot write files", async () => {
  const { directory, calls } = folder({ existing: [`news-${firstUUID}.png`] });
  const prepared = { blob: png(1200, 750), extension: "png" };
  await assert.rejects(saveNewsImageToDirectory({ ...directory, name: "project" }, prepared), { code: "folder-invalid" });
  assert.equal(calls.directory.length, 0);
  await assert.rejects(saveNewsImageToDirectory(directory, prepared, { randomUUID: () => firstUUID }), { code: "save-collision" });
  assert.equal(calls.writes, 0);
});

test("write and permission failures propagate without reporting a saved image", async () => {
  const prepared = { blob: png(1200, 750), extension: "png" };
  const failed = folder({ failWrite: true });
  await assert.rejects(saveNewsImageToDirectory(failed.directory, prepared, { randomUUID: () => firstUUID }), /disk full/);
  assert.equal(failed.calls.aborted, 1);
  assert.equal(failed.files.size, 0);
  const denied = folder({ denyLookup: true });
  await assert.rejects(saveNewsImageToDirectory(denied.directory, prepared, { randomUUID: () => firstUUID }), { name: "NotAllowedError" });
  assert.equal(denied.calls.writes, 0);
});
