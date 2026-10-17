// Only already-public news attachments from our own published catalogue may be
// copied to the static CDN. Never fetch arbitrary image URLs or private routes.
const attachmentPath = /^\/api\/staff\/public\/news\/[a-f0-9-]{36}\/attachments\/[a-f0-9-]{36}$/i;
const hosts = new Set(["noortetugi.ee", "www.noortetugi.ee"]);
export function publishedImageUrls(articles) {
  const paths = new Set();
  for (const article of Array.isArray(articles) ? articles : []) {
    for (const source of [article.image, article.originalImage, ...(Array.isArray(article.additionalImages) ? article.additionalImages : [])]) {
      if (typeof source !== "string") continue;
      try {
        const url = new URL(source);
        if (url.protocol === "https:" && hosts.has(url.hostname) && !url.port &&
            !url.username && !url.password && !url.search && !url.hash && attachmentPath.test(url.pathname))
          paths.add(url.pathname);
      } catch { /* Local static images are handled by the existing optimizer. */ }
    }
  }
  return [...paths].map((path) => new URL(path, "https://www.noortetugi.ee").href);
}

export async function* publishedImageSources(articles, fetchImage = fetch) {
  const deadline = Date.now() + 30_000;
  for (const url of publishedImageUrls(articles)) {
    if (Date.now() >= deadline) break;
    try {
      const response = await fetchImage(url, {
        credentials: "omit", redirect: "error",
        signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now())))
      });
      if (!response.ok || !/^image\/(jpeg|png|webp|avif)(;|$)/i.test(response.headers.get("content-type") || "")) {
        await response.body?.cancel();
        continue;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 25 * 1024 * 1024) throw new Error("Image size limit");
        chunks.push(chunk);
      }
      yield { path: new URL(url).pathname.slice(1), input: Buffer.concat(chunks) };
    } catch {
      // New articles can still be completing publication. Their existing public
      // image endpoint remains the fallback; a timeout must not break the build.
      console.warn("Published image not prebuilt; public endpoint fallback retained.");
    }
  }
}
