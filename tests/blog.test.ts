import { describe, expect, it } from "vitest";
import { BLOG_ARTICLES } from "../src/app/pages/blog/BlogData";

describe("blog articles", () => {
  it("have unique slugs (route collisions would shadow one of them)", () => {
    const slugs = BLOG_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("have non-empty EN/ID titles and descriptions for both locales", () => {
    for (const article of BLOG_ARTICLES) {
      expect(article.title.en.trim()).not.toBe("");
      expect(article.title.id.trim()).not.toBe("");
      expect(article.description.en.trim()).not.toBe("");
      expect(article.description.id.trim()).not.toBe("");
    }
  });

  it("have non-empty content arrays (prerender bakes metadata from these)", () => {
    for (const article of BLOG_ARTICLES) {
      expect(article.content.en.length).toBeGreaterThan(0);
      expect(article.content.id.length).toBeGreaterThan(0);
    }
  });
});
