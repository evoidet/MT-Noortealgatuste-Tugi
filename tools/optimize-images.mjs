import sharp from "sharp";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { publishedImageSources } from "./published-image-sources.mjs";

export async function optimizeImages(root, output, publicFiles) {
  const names = (await readdir(root)).filter(
    (n) => publicFiles.has(n) && /\.(html|js|css|json)$/.test(n),
  );
  const texts = await Promise.all(
    names.map((n) => readFile(resolve(root, n), "utf8")),
  );
  const paths = new Set(
    texts.flatMap((text) =>
      [
        ...text.matchAll(
          /(?:\/)?assets\/[a-zA-Z0-9_./-]+\.(?:png|jpg|jpeg|webp)/g,
        ),
      ].map((m) => m[0].replace(/^\//, "")),
    ),
  );
  const manifest = {},
    report = [];
  const cache = resolve(root, "node_modules/.cache/noortetugi-images");
  await mkdir(cache, { recursive: true });
  await mkdir(resolve(output, "assets/responsive"), { recursive: true });
  async function* sources() {
    for (const path of paths) yield { path, input: await readFile(resolve(root, path)).catch(() => null) };
    const catalogue = names.indexOf("published-news.json");
    if (catalogue !== -1) yield* publishedImageSources(JSON.parse(texts[catalogue]));
  }
  // Sequential work bounds decoder memory even for the largest photographs.
  for await (const { path, input } of sources()) {
    // Team portraits already have reviewed responsive WebP files and a lightbox size.
    if (!input || path.startsWith("assets/team/optimized/")) continue;
    let metadata;
    try {
      metadata = await sharp(input, { limitInputPixels: 80_000_000 }).metadata();
    } catch (error) {
      if (!path.startsWith("api/staff/public/news/")) throw error;
      console.warn("Published image could not be decoded; public endpoint fallback retained.");
      continue;
    }
    if (!metadata.width || metadata.width < 480 || input.length < 30000)
      continue;
    const hash = createHash("sha256")
      .update(input)
      .update("responsive-v1-q86-avif65")
      .digest("hex")
      .slice(0, 16);
    const widths = [480, 960, 1440].filter((w) => w <= metadata.width);
    if (!widths.includes(metadata.width) && metadata.width < 1440)
      widths.push(metadata.width);
    const variants = {
      webp: [],
      avif: [],
      width: metadata.width,
      height: metadata.height,
    };
    for (const width of widths)
      for (const format of ["webp", "avif"]) {
        const url = `/assets/responsive/${hash}-${width}.${format}`;
        const cached = resolve(cache, `${hash}-${width}.${format}`);
        let buffer = await readFile(cached).catch(() => null);
        if (!buffer) {
          buffer = await sharp(input, { limitInputPixels: 80_000_000 })
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .toFormat(
              format,
              format === "avif" ? { quality: 65, effort: 4 } : { quality: 86 },
            )
            .toBuffer();
          await writeFile(cached, buffer);
        }
        await writeFile(resolve(output, `.${url}`), buffer);
        // Already compressed originals can beat a high-quality re-encode. Never
        // advertise a larger candidate merely to force a modern file extension.
        if (buffer.length < input.length)
          variants[format].push({ url, width, bytes: buffer.length });
      }
    if (!variants.webp.length)
      variants.webp.push({
        url: `/${path}`,
        width: metadata.width,
        bytes: input.length,
      });
    manifest[`/${path}`] = variants;
    report.push({ path, originalBytes: input.length, variants });
  }
  for (const name of names.filter((n) => n.endsWith(".html"))) {
    let html = await readFile(resolve(output, name), "utf8");
    html = html.replace(/<img\b[^>]*>/g, (tag) => {
      // The shared lightbox changes src at runtime; static candidates would override it.
      if (/\bid="photoModalImage"/.test(tag)) return tag;
      const src = /\bsrc="([^"]+)"/.exec(tag)?.[1];
      const item = manifest[`/${src?.replace(/^\//, "")}`];
      if (!item || /\bsrcset=/.test(tag)) return tag;
      const srcset = (format) =>
        item[format].map((v) => `${v.url} ${v.width}w`).join(", ");
      let next = tag.replace(/\bsrc="[^"]+"/, `src="${item.webp[0].url}"`);
      if (!/\bdata-full=/.test(next))
        next = next.replace("<img", `<img data-full="${src}"`);
      next = next.replace(
        /\s*\/?>(\s*)$/,
        ` srcset="${srcset("webp")}" sizes="(max-width: 700px) 100vw, 960px">`,
      );
      if (!/\bwidth=/.test(next))
        next = next.replace(
          "<img",
          `<img width="${item.width}" height="${item.height}"`,
        );
      if (!/\bdecoding=/.test(next))
        next = next.replace("<img", '<img decoding="async"');
      return item.avif.length
        ? `<picture><source type="image/avif" srcset="${srcset("avif")}" sizes="(max-width: 700px) 100vw, 960px">${next}</picture>`
        : next;
    });
    await writeFile(resolve(output, name), html);
  }
  const helper = await readFile(resolve(root, "responsive-images.js"), "utf8");
  await writeFile(
    resolve(output, "responsive-images.js"),
    `window.SITE_IMAGE_VARIANTS=${JSON.stringify(manifest)};\n${helper}`,
  );
  await writeFile(
    resolve(output, "image-optimization-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Generated responsive WebP/AVIF variants for ${report.length} referenced images; originals preserved.`,
  );
}
