import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { responsivePublicImage } from "../src/public-image.js";
test("published image variants resize without upscaling, preserve originals and support WebP/AVIF", async () => {
  const original = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: "#8ac450" },
  })
    .png()
    .toBuffer();
  const copy = Buffer.from(original);
  for (const format of ["webp", "avif"]) {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(original);
        c.close();
      },
    });
    const result = await responsivePublicImage({ stream }, 480, format);
    const metadata = await sharp(result).metadata();
    assert.equal(metadata.width, 480);
    assert.equal(metadata.height, 300);
    assert.equal(metadata.format, format === "avif" ? "heif" : "webp");
    assert.ok(result.length < original.length);
  }
  assert.deepEqual(original, copy);
  await assert.rejects(
    responsivePublicImage(
      {
        stream: new ReadableStream({
          start(c) {
            c.enqueue(Buffer.from("invalid"));
            c.close();
          },
        }),
      },
      480,
      "webp",
    ),
  );
});

test("decoder saturation leaves the original stream available for HTTP fallback", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const original = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#8ac450" } }).png().toBuffer();
  const jobs = Array.from({ length: 8 }, () => responsivePublicImage({ stream: new ReadableStream({ async start(c) { await gate; c.enqueue(original); c.close(); } }) }, 480, "webp"));
  const stream = new ReadableStream({ start(c) { c.enqueue(original); c.close(); } });
  try {
    await assert.rejects(responsivePublicImage({ stream }, 480, "webp"), { code: "IMAGE_BUSY" });
    assert.equal(stream.locked, false);
    assert.deepEqual(Buffer.from(await new Response(stream).arrayBuffer()), original);
  } finally {
    release();
    await Promise.all(jobs);
  }
});
