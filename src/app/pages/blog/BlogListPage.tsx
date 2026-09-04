import { Link } from "react-router";
import { ArrowRight, Calendar, Clock, Tag } from "lucide-react";
import { LokaLogo } from "../../components/LokaLogo";
import { SEOHead } from "../../components/SEOHead";
import { useLang } from "../../LangContext";
import { BLOG_ARTICLES } from "./BlogData";

export function BlogListPage() {
  const { lang } = useLang();

  return (
    <div
      className="dark flex min-h-screen w-full flex-col items-center bg-[#0f0f0f] text-neutral-50"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <SEOHead
        title="Blog — LokaSync"
        description="Insights on project management, team productivity, and workspace best practices. Learn how to manage projects more effectively."
        canonical="https://lokasync.app/blog"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "LokaSync Blog",
          description: "Insights on project management, team productivity, and workspace best practices.",
          url: "https://lokasync.app/blog",
          blogPost: BLOG_ARTICLES.map((a) => ({
            "@type": "BlogPosting",
            headline: a.title[lang],
            description: a.description[lang],
            url: `https://lokasync.app/blog/${a.slug}`,
            datePublished: a.date,
          })),
        }}
      />

      {/* Header */}
      <header className="w-full max-w-3xl px-6 pt-10 pb-4">
        <LokaLogo size="md" />
      </header>

      <main className="w-full max-w-3xl px-6 pb-24">
        <div className="mb-10">
          <h1 className="text-[32px] font-semibold text-neutral-50 mb-3">
            Blog
          </h1>
          <p className="text-[15px] text-neutral-400 max-w-lg">
            Insights on project management, team productivity, and workspace best practices.
          </p>
        </div>

        {/* Article list */}
        <div className="flex flex-col gap-6">
          {BLOG_ARTICLES.map((article) => (
            <Link
              key={article.slug}
              to={`/blog/${article.slug}`}
              className="group block rounded-2xl border border-neutral-800 bg-[#141414] p-6 transition-colors hover:border-neutral-700 hover:bg-[#1a1a1a]"
            >
              <div className="flex items-center gap-3 mb-3 text-[12px] text-neutral-500">
                <span className="flex items-center gap-1">
                  <Tag size={12} />
                  {article.category}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {article.date}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {article.readTime}
                </span>
              </div>
              <h2 className="text-[20px] font-semibold text-neutral-100 mb-2 group-hover:text-indigo-400 transition-colors">
                {article.title[lang]}
              </h2>
              <p className="text-[14px] text-neutral-400 leading-relaxed mb-4">
                {article.description[lang]}
              </p>
              <span className="flex items-center gap-1 text-[13px] text-indigo-400 group-hover:gap-2 transition-all">
                {lang === "id" ? "Baca selengkapnya" : "Read more"} <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-neutral-500 text-[14px] mb-4">
            {lang === "id"
              ? "Siap mencoba workspace yang lebih baik?"
              : "Ready to try a better workspace?"}
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-[14px] text-white hover:bg-indigo-500 transition-colors"
          >
            {lang === "id" ? "Mulai gratis" : "Start free"} <ArrowRight size={16} />
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-neutral-800 py-8 text-center text-[12px] text-neutral-600">
        <Link to="/" className="hover:text-neutral-400 transition-colors">LokaSync</Link>
        <span className="mx-2">·</span>
        <Link to="/pricing" className="hover:text-neutral-400 transition-colors">Pricing</Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-neutral-400 transition-colors">Privacy</Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:text-neutral-400 transition-colors">Terms</Link>
      </footer>
    </div>
  );
}
