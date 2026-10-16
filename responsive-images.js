// Build supplies a content-addressed manifest; development falls back to the original URLs.
window.newsImageAttributes = function (source) {
  const escape = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  let url;
  try {
    url = new URL(source, window.location.origin);
  } catch {
    return "";
  }
  if (url.origin !== window.location.origin) return "";
  let variants = window.SITE_IMAGE_VARIANTS?.[url.pathname]?.webp;
  if (
    /^\/api\/staff\/public\/news\/[a-f0-9-]+\/attachments\/[a-f0-9-]+$/.test(
      url.pathname,
    )
  ) {
    variants = [480, 960, 1440].map((width) => ({
      width,
      url: `${url.pathname}?w=${width}&format=webp`,
    }));
  }
  return variants?.length
    ? `data-full="${escape(url.href)}" srcset="${escape(variants.map((v) => `${v.url} ${v.width}w`).join(", "))}" sizes="(max-width: 700px) 100vw, 960px"`
    : "";
};
