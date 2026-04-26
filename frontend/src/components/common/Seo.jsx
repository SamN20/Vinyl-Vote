import { useEffect } from "react";

const SITE_NAME = "Vinyl Vote";

function siteUrl() {
  const configuredUrl = import.meta.env.VITE_PUBLIC_SITE_URL;
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }

  return "";
}

function defaultImageUrl() {
  return `${siteUrl()}/static/favicon_180x180.png`;
}

function upsertMetaTag({ name, property, content }) {
  if (!content) {
    return;
  }

  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    if (name) {
      element.setAttribute("name", name);
    }
    if (property) {
      element.setAttribute("property", property);
    }
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function upsertCanonicalLink(url) {
  if (!url) {
    return;
  }

  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

function upsertSchema(id, schema) {
  const scriptId = id || "page-seo-schema";
  let script = document.getElementById(scriptId);

  if (!schema) {
    script?.remove();
    return;
  }

  if (!script) {
    script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.id = scriptId;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schema);
}

export function buildCanonicalUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${normalizedPath}`;
}

export default function Seo({
  title,
  description,
  path = "/",
  image,
  robots = "index,follow",
  type = "website",
  schema,
  schemaId = "page-seo-schema",
}) {
  useEffect(() => {
    const canonicalUrl = buildCanonicalUrl(path);
    const fullTitle = title?.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    const previewImage = image || defaultImageUrl();

    document.title = fullTitle;

    upsertMetaTag({ name: "description", content: description });
    upsertMetaTag({ name: "robots", content: robots });
    upsertMetaTag({ property: "og:type", content: type });
    upsertMetaTag({ property: "og:site_name", content: SITE_NAME });
    upsertMetaTag({ property: "og:title", content: fullTitle });
    upsertMetaTag({ property: "og:description", content: description });
    upsertMetaTag({ property: "og:image", content: previewImage });
    upsertMetaTag({ property: "og:url", content: canonicalUrl });
    upsertMetaTag({ name: "twitter:card", content: "summary_large_image" });
    upsertMetaTag({ name: "twitter:title", content: fullTitle });
    upsertMetaTag({ name: "twitter:description", content: description });
    upsertMetaTag({ name: "twitter:image", content: previewImage });
    upsertCanonicalLink(canonicalUrl);
    upsertSchema(schemaId, schema);
  }, [description, image, path, robots, schema, schemaId, title, type]);

  return null;
}
