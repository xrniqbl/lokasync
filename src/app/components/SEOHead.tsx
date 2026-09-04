import { useEffect } from "react";

interface SEOProps {
  title: string;
  description?: string;
  canonical?: string;
  robots?: string;
  ogType?: string;
  ogImage?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Lightweight SEO head manager for SPA.
 * Updates <title>, meta tags, canonical, and injects JSON-LD structured data.
 * No external dependencies — uses direct DOM manipulation.
 */
export function SEOHead({
  title,
  description,
  canonical,
  robots = "index, follow",
  ogType = "website",
  ogImage = "https://lokasync.app/og-image.png",
  jsonLd,
}: SEOProps) {
  useEffect(() => {
    // Title
    document.title = title;

    // Helper to set/create meta tags
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // Canonical
    let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute("href", canonical ?? `https://lokasync.app${window.location.pathname}`);

    // Meta tags
    if (description) setMeta("name", "description", description);
    setMeta("name", "robots", robots);

    // Open Graph
    setMeta("property", "og:title", title);
    if (description) setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonical ?? `https://lokasync.app${window.location.pathname}`);
    setMeta("property", "og:type", ogType);
    setMeta("property", "og:image", ogImage);

    // Twitter Card (keeps in sync with OG tags per page)
    setMeta("name", "twitter:title", title);
    if (description) setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", ogImage);

    // JSON-LD structured data
    // Remove old JSON-LD blocks we added
    document.querySelectorAll('script[data-seo-jsonld]').forEach((el) => el.remove());

    if (jsonLd) {
      const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      for (const item of items) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-seo-jsonld", "true");
        script.textContent = JSON.stringify(item);
        document.head.appendChild(script);
      }
    }

    // Cleanup: restore original title on unmount
    return () => {
      document.title = "LokaSync — Project Management Workspace for Teams";
      document.querySelectorAll('script[data-seo-jsonld]').forEach((el) => el.remove());
    };
  }, [title, description, canonical, robots, ogType, ogImage, jsonLd]);

  return null; // renders nothing to the DOM
}
