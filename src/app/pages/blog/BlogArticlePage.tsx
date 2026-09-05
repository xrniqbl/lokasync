import { Link, useParams } from "react-router";
import { ArrowLeft, Calendar, Clock, Tag } from "lucide-react";
import { LokaLogo } from "../../components/LokaLogo";
import { SEOHead } from "../../components/SEOHead";
import { useLang } from "../../LangContext";
import { BLOG_ARTICLES, type BlogArticle } from "./BlogData";

/**
 * Simple markdown-like renderer for blog content.
 * Handles ## headings, **bold**, - bullets, and numbered lists.
 * Avoids any external markdown library dependency.
 */
function RenderContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={i}
          className="text-[22px] font-semibold text-neutral-100 mt-10 mb-4"
        >
          {line.replace("## ", "")}
        </h2>,
      );
    } else if (line.startsWith("- ")) {
      // Collect consecutive bullets
      const bullets: string[] = [line.replace("- ", "")];
      while (i + 1 < lines.length && lines[i + 1].startsWith("- ")) {
        i++;
        bullets.push(lines[i].replace("- ", ""));
      }
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-2 text-[15px] text-neutral-300 leading-relaxed mb-4 pl-2">
          {bullets.map((b, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: inlineFormat(b) }} />
          ))}
        </ul>,
      );
    } else if (/^\d+\./.test(line)) {
      // Collect consecutive numbered items
      const items: string[] = [line.replace(/^\d+\.\s*/, "")];
      while (i + 1 < lines.length && /^\d+\./.test(lines[i + 1])) {
        i++;
        items.push(lines[i].replace(/^\d+\.\s*/, ""));
      }
      elements.push(
        <ol key={i} className="list-decimal list-inside space-y-2 text-[15px] text-neutral-300 leading-relaxed mb-4 pl-2">
          {items.map((item, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
          ))}
        </ol>,
      );
    } else if (line.trim() === "") {
      // Skip blank lines
    } else {
      elements.push(
        <p
          key={i}
          className="text-[15px] text-neutral-300 leading-relaxed mb-4"
          dangerouslySetInnerHTML={{ __html: inlineFormat(line) }}
        />,
      );
    }
  }

  return <>{elements}</>;
}

/** Format inline markdown: **bold** */
function inlineFormat(text: string): string {
  // Escape first, then apply the bold markup — content is first-party today,
  // but any future source (CMS, contributor post) must not inject raw HTML.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong class="text-neutral-100 font-semibold">$1</strong>');
}

export function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { lang } = useLang();

  const article = BLOG_ARTICLES.find((a) => a.slug === slug);

  if (!article) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-[#0f0f0f] text-neutral-50" style={{ fontFamily: "Lexend, sans-serif" }}>
        <SEOHead title="Article Not Found — LokaSync Blog" robots="noindex, nofollow" />
        <div className="text-center">
          <h1 className="text-[24px] font-semibold mb-4">Article not found</h1>
          <Link to="/blog" className="text-indigo-400 hover:underline">Back to blog</Link>
        </div>
      </div>
    );
  }

  const paragraphs = article.content[lang];

  return (
    <div
      className="dark flex min-h-screen w-full flex-col items-center bg-[#0f0f0f] text-neutral-50"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <SEOHead
        title={article.title[lang]}
        description={article.description[lang]}
        canonical={`https://lokasync.app/blog/${article.slug}`}
        ogType="article"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: article.title[lang],
          description: article.description[lang],
          url: `https://lokasync.app/blog/${article.slug}`,
          datePublished: article.date,
          author: {
            "@type": "Organization",
            name: "LokaSync",
          },
          publisher: {
            "@type": "Organization",
            name: "LokaSync",
            logo: {
              "@type": "ImageObject",
              url: "https://lokasync.app/lokasynclogo.png",
            },
          },
        }}
      />

      {/* Header */}
      <header className="w-full max-w-3xl px-6 pt-10 pb-4">
        <LokaLogo size="md" />
      </header>

      <main className="w-full max-w-3xl px-6 pb-24">
        {/* Back link */}
        <Link
          to="/blog"
          className="flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          {lang === "id" ? "Kembali ke blog" : "Back to blog"}
        </Link>

        {/* Article meta */}
        <div className="flex items-center gap-3 mb-4 text-[12px] text-neutral-500">
          <span className="flex items-center gap-1"><Tag size={12} /> {article.category}</span>
          <span className="flex items-center gap-1"><Calendar size={12} /> {article.date}</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {article.readTime}</span>
        </div>

        {/* Title */}
        <h1 className="text-[32px] font-semibold text-neutral-50 mb-6 leading-tight">
          {article.title[lang]}
        </h1>

        {/* Description */}
        <p className="text-[16px] text-neutral-400 leading-relaxed mb-8 border-l-2 border-indigo-500 pl-4">
          {article.description[lang]}
        </p>

        {/* Content */}
        <article className="prose-custom">
          {paragraphs.map((p, i) => (
            <RenderContent key={i} content={p} />
          ))}
        </article>

        {/* CTA */}
        <div className="mt-16 rounded-2xl border border-neutral-800 bg-[#141414] p-8 text-center">
          <h3 className="text-[20px] font-semibold text-neutral-100 mb-2">
            {lang === "id" ? "Coba LokaSync gratis" : "Try LokaSync free"}
          </h3>
          <p className="text-[14px] text-neutral-400 mb-4">
            {lang === "id"
              ? "Kelola hingga 3 proyek tanpa biaya. Tidak perlu kartu kredit."
              : "Manage up to 3 projects at no cost. No credit card required."}
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-[14px] text-white hover:bg-indigo-500 transition-colors"
          >
            {lang === "id" ? "Mulai gratis" : "Start free"}
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-neutral-800 py-8 text-center text-[12px] text-neutral-600">
        <Link to="/" className="hover:text-neutral-400 transition-colors">LokaSync</Link>
        <span className="mx-2">·</span>
        <Link to="/blog" className="hover:text-neutral-400 transition-colors">Blog</Link>
        <span className="mx-2">·</span>
        <Link to="/pricing" className="hover:text-neutral-400 transition-colors">Pricing</Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-neutral-400 transition-colors">Privacy</Link>
      </footer>
    </div>
  );
}
