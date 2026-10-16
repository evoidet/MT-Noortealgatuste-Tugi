// Only receives bytes from an already authorized published-news attachment, never an arbitrary URL.
let active = 0;
const waiting = [];
export async function responsivePublicImage(opened, width, format) {
  if (active < 2) active++;
  else {
    if (waiting.length >= 6) {
      // Leave the stream untouched so the HTTP route can serve the original.
      throw Object.assign(new Error("Image processing is busy."), {
        code: "IMAGE_BUSY",
      });
    }
    await new Promise((resolve) => waiting.push(resolve));
  }
  try {
    return await transformPublicImage(opened, width, format);
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

async function transformPublicImage(opened, width, format) {
  const { default: sharp } = await import("sharp");
  const reader = opened.stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 25 * 1024 * 1024) throw new Error("Image too large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .toFormat(
      format,
      format === "avif" ? { quality: 65, effort: 3 } : { quality: 86 },
    )
    .toBuffer();
}
