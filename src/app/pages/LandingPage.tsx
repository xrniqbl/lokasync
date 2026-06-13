import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, Menu, ShieldCheck, X } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/cossui/accordion";
import { Button } from "@/components/cossui/button";
import { useAuth } from "../auth/AuthContext";
import { detectLang, LangToggle, persistLang, type Lang } from "../i18n";
import { getPlans, type Plan } from "../utils/api";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/* ── i18n ─────────────────────────────────────────────────────────────────── */

const STRINGS = {
  en: {
    nav: {
      pricing: "Pricing",
      signIn: "Sign in",
      getStarted: "Get started",
      openDashboard: "Open dashboard",
      faq: "FAQ",
    },
    hero: {
      eyebrow: "n. a place",
      titleA: "Every project,",
      titleB: "one place.",
      sub: "LokaSync brings your team's tasks, timelines, files, and reporting into one minimal workspace — so the work gets the attention, not the tool.",
      ctaPrimary: "Start free",
      ctaSecondary: "View pricing",
      note: "Free for up to 3 projects. No credit card required.",
    },
    socialProof: {
      teamCount: "1,200+",
      teamLabel: "teams",
      taskCount: "45K+",
      taskLabel: "tasks completed",
      countryCount: "12",
      countryLabel: "countries",
    },
    integrations: {
      title: "Works with your favorite tools",
    },
    features: {
      title: "What's inside the workspace",
      sub: "Six views over the same work. Pick the one that fits the moment.",
      items: [
        { name: "Tasks", description: "Assign, prioritize, and move tasks through to done." },
        { name: "Projects", description: "Progress, milestones, and status for every project." },
        { name: "Calendar", description: "Deadlines and events on a shared team calendar." },
        { name: "Teams", description: "See who is on what, and how much they are carrying.", pro: true },
        { name: "Analytics", description: "Velocity, efficiency, and delivery reports for the team.", pro: true },
        { name: "Files", description: "Project files organized next to the work they belong to." },
      ],
    },
    testimonials: {
      title: "Teams that gave their work a place",
      sub: "What early teams say after moving their projects into LokaSync.",
      items: [
        {
          quote:
            "We replaced three different tools with LokaSync. Now standups are just: open the dashboard, look at the board, done.",
          name: "Rizky Pratama",
          role: "Product Manager, creative studio",
        },
        {
          quote:
            "The free plan was enough to convince the whole team. We upgraded once the client projects started piling up.",
          name: "Sarah Nabila",
          role: "Founder, digital agency",
        },
        {
          quote:
            "Paying with a bank virtual account instead of a credit card made it easy to get this approved by finance.",
          name: "Dimas Wijaya",
          role: "Engineering Lead, software house",
        },
      ],
    },
    pricing: {
      title: "Start free, upgrade when your team grows",
      sub: "All prices in Indonesian Rupiah. Yearly billing gets 2 months free.",
      seeFull: "See full pricing",
      perMonth: "/month",
      mostPopular: "Most popular",
    },
    payments: {
      secure: "Secure payments processed by Midtrans",
      via: "Pay by bank transfer (virtual account):",
    },
    faq: {
      title: "Frequently asked questions",
      sub: "Everything you need to know before you start.",
      items: [
        {
          q: "What is LokaSync?",
          a: "LokaSync is a project-management workspace for teams. It brings tasks, projects, a shared calendar, team workload, analytics, and files together in one place, so you don't have to jump between tools.",
        },
        {
          q: "Is the Free plan really free?",
          a: "Yes. The Free plan gives you up to 3 projects with no time limit and no credit card required. Upgrade to Pro or Business when you need unlimited projects, Analytics, and Team management.",
        },
        {
          q: "What payment methods can I use?",
          a: "Payments are processed securely by Midtrans, so you can pay with bank transfer (virtual account) and other popular payment methods in Indonesia. All prices are in Indonesian Rupiah.",
        },
        {
          q: "Can I use a voucher code?",
          a: "Yes. Enter your voucher code on the checkout page and the discount is applied to your total before you pay.",
        },
        {
          q: "What happens when my subscription ends?",
          a: "Your account automatically returns to the Free plan. Your data stays safe — paid features like Analytics and Team management simply lock until you renew.",
        },
        {
          q: "Do I save money with yearly billing?",
          a: "Yes. Yearly billing costs the same as 10 months, so you get 2 months free compared to paying monthly.",
        },
      ],
    },
    cta: {
      title: "Give the work a place.",
      sub: "Create your workspace in a minute. Bring the team when you're ready.",
      button: "Create your workspace",
    },
    footer: {
      tagline: "One minimal workspace for your team's projects, tasks, and reporting.",
      product: "Product",
      account: "Account",
      language: "Language",
      links: {
        pricing: "Pricing",
        faq: "FAQ",
        features: "Features",
        signIn: "Sign in",
        createAccount: "Create account",
        dashboard: "Dashboard",
        privacy: "Privacy Policy",
        terms: "Terms of Service",
      },
      rights: "All rights reserved.",
    },
  },
  id: {
    nav: {
      pricing: "Harga",
      signIn: "Masuk",
      getStarted: "Mulai sekarang",
      openDashboard: "Buka dashboard",
      faq: "FAQ",
    },
    hero: {
      eyebrow: "n. tempat",
      titleA: "Semua proyek,",
      titleB: "satu tempat.",
      sub: "LokaSync menyatukan tugas, linimasa, file, dan laporan tim Anda dalam satu ruang kerja minimal — supaya pekerjaan yang mendapat perhatian, bukan alatnya.",
      ctaPrimary: "Mulai gratis",
      ctaSecondary: "Lihat harga",
      note: "Gratis hingga 3 proyek. Tanpa kartu kredit.",
    },
    socialProof: {
      teamCount: "1.200+",
      teamLabel: "tim",
      taskCount: "45K+",
      taskLabel: "tugas selesai",
      countryCount: "12",
      countryLabel: "negara",
    },
    integrations: {
      title: "Terintegrasi dengan alat favorit Anda",
    },
    features: {
      title: "Apa saja di dalam ruang kerja",
      sub: "Enam tampilan untuk pekerjaan yang sama. Pilih yang paling pas untuk momennya.",
      items: [
        { name: "Tugas", description: "Tetapkan, prioritaskan, dan selesaikan tugas sampai tuntas." },
        { name: "Proyek", description: "Progres, milestone, dan status untuk setiap proyek." },
        { name: "Kalender", description: "Tenggat dan agenda di kalender tim bersama." },
        { name: "Tim", description: "Lihat siapa mengerjakan apa dan seberapa besar bebannya.", pro: true },
        { name: "Analitik", description: "Laporan kecepatan, efisiensi, dan pengiriman tim.", pro: true },
        { name: "File", description: "File proyek tertata di samping pekerjaan terkait." },
      ],
    },
    testimonials: {
      title: "Tim yang memberi pekerjaannya sebuah tempat",
      sub: "Kata tim-tim awal setelah memindahkan proyeknya ke LokaSync.",
      items: [
        {
          quote:
            "Kami mengganti tiga aplikasi berbeda dengan LokaSync. Sekarang standup cukup: buka dashboard, lihat papan, selesai.",
          name: "Rizky Pratama",
          role: "Product Manager, studio kreatif",
        },
        {
          quote:
            "Paket gratisnya saja sudah cukup meyakinkan seluruh tim. Kami upgrade begitu proyek klien mulai menumpuk.",
          name: "Sarah Nabila",
          role: "Founder, agensi digital",
        },
        {
          quote:
            "Bisa bayar lewat virtual account bank tanpa kartu kredit membuat persetujuan dari bagian keuangan jadi mudah.",
          name: "Dimas Wijaya",
          role: "Engineering Lead, software house",
        },
      ],
    },
    pricing: {
      title: "Mulai gratis, upgrade saat tim bertumbuh",
      sub: "Semua harga dalam Rupiah. Tagihan tahunan gratis 2 bulan.",
      seeFull: "Lihat harga lengkap",
      perMonth: "/bulan",
      mostPopular: "Paling populer",
    },
    payments: {
      secure: "Pembayaran aman diproses oleh Midtrans",
      via: "Bayar lewat transfer bank (virtual account):",
    },
    faq: {
      title: "Pertanyaan yang sering diajukan",
      sub: "Semua yang perlu Anda tahu sebelum mulai.",
      items: [
        {
          q: "Apa itu LokaSync?",
          a: "LokaSync adalah ruang kerja manajemen proyek untuk tim. Tugas, proyek, kalender bersama, beban kerja tim, analitik, dan file disatukan di satu tempat — tanpa perlu berpindah-pindah aplikasi.",
        },
        {
          q: "Apakah paket Free benar-benar gratis?",
          a: "Ya. Paket Free memberi Anda hingga 3 proyek tanpa batas waktu dan tanpa kartu kredit. Upgrade ke Pro atau Business saat Anda butuh proyek tanpa batas, Analitik, dan manajemen Tim.",
        },
        {
          q: "Metode pembayaran apa saja yang didukung?",
          a: "Pembayaran diproses secara aman oleh Midtrans, sehingga Anda bisa membayar lewat transfer bank (virtual account) dan metode pembayaran populer lain di Indonesia. Semua harga dalam Rupiah.",
        },
        {
          q: "Bisakah saya memakai kode voucher?",
          a: "Bisa. Masukkan kode voucher di halaman checkout dan diskon langsung dihitung ke total sebelum Anda membayar.",
        },
        {
          q: "Apa yang terjadi saat langganan saya berakhir?",
          a: "Akun Anda otomatis kembali ke paket Free. Data Anda tetap aman — fitur berbayar seperti Analitik dan manajemen Tim hanya terkunci sampai Anda memperpanjang.",
        },
        {
          q: "Apakah tagihan tahunan lebih hemat?",
          a: "Ya. Tagihan tahunan setara 10 bulan, jadi Anda hemat 2 bulan dibanding membayar bulanan.",
        },
      ],
    },
    cta: {
      title: "Beri pekerjaan sebuah tempat.",
      sub: "Buat ruang kerja dalam satu menit. Ajak tim saat Anda siap.",
      button: "Buat ruang kerja",
    },
    footer: {
      tagline: "Satu ruang kerja minimal untuk proyek, tugas, dan laporan tim Anda.",
      product: "Produk",
      account: "Akun",
      language: "Bahasa",
      links: {
        pricing: "Harga",
        faq: "FAQ",
        features: "Fitur",
        signIn: "Masuk",
        createAccount: "Buat akun",
        dashboard: "Dashboard",
        privacy: "Kebijakan Privasi",
        terms: "Syarat Layanan",
      },
      rights: "Hak cipta dilindungi.",
    },
  },
} as const;

/* Hero vignette data — three tasks that check themselves off in a slow loop. */
const DEMO_TASKS = [
  { title: "Wireframe the new dashboard", tag: "Design", initials: "AR" },
  { title: "Set up the staging environment", tag: "Dev", initials: "DW" },
  { title: "Write the launch announcement", tag: "Marketing", initials: "SN" },
];

function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" aria-label="LokaSync home">
      <img
        src="/lokasynclogo.png"
        alt="LokaSync"
        className={small ? "h-5 w-auto" : "h-7 w-auto"}
        style={{ objectFit: "contain" }}
      />
    </Link>
  );
}

const SOCIALS: { name: string; href: string; path: string }[] = [
  {
    name: "Instagram",
    href: "https://instagram.com/lokasync",
    path: "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z",
  },
  {
    name: "TikTok",
    href: "https://tiktok.com/@lokasync",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
  {
    name: "YouTube",
    href: "https://youtube.com/@lokasync",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
];

function SocialLinks() {
  return (
    <div className="flex items-center gap-3">
      {SOCIALS.map((social) => (
        <a
          key={social.name}
          href={social.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={social.name}
          className="flex size-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-neutral-400 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/40 hover:text-neutral-100"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-4"
            aria-hidden="true"
          >
            <path d={social.path} />
          </svg>
        </a>
      ))}
    </div>
  );
}

/** Adds `.loka-in` once the element scrolls into view (reveal-on-scroll). */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.classList.add("loka-in");
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("loka-in");
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`loka-reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** Floating glassmorphism navbar with a mobile menu. */
function Navbar({
  user,
  lang,
  onLangChange,
}: {
  user: ReturnType<typeof useAuth>["user"];
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}) {
  const [open, setOpen] = useState(false);
  const t = STRINGS[lang].nav;

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between pl-5 pr-3">
          <Logo small />

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 sm:flex">
            <Button variant="ghost" size="sm" render={<Link to="/pricing" />}>
              {t.pricing}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={<a href="#faq" />}
            >
              {t.faq}
            </Button>
            <LangToggle lang={lang} onChange={onLangChange} className="mx-1" />
            {user ? (
              <Button size="sm" render={<Link to="/app/dashboard" />}>
                {t.openDashboard}
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" render={<Link to="/login" />}>
                  {t.signIn}
                </Button>
                <Button size="sm" render={<Link to="/register" />}>
                  {t.getStarted}
                </Button>
              </>
            )}
          </nav>

          {/* Mobile: lang toggle + menu button */}
          <div className="flex items-center gap-2 sm:hidden">
            <LangToggle lang={lang} onChange={onLangChange} />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="flex size-10 cursor-pointer items-center justify-center rounded-xl text-neutral-300 transition-colors hover:bg-white/[0.06]"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <nav className="flex flex-col gap-1 border-t border-white/[0.08] p-3 sm:hidden">
            <Link
              to="/pricing"
              className="rounded-xl px-3 py-2.5 text-[14px] text-neutral-300 transition-colors hover:bg-white/[0.06]"
            >
              {t.pricing}
            </Link>
            <a
              href="#faq"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-[14px] text-neutral-300 transition-colors hover:bg-white/[0.06]"
            >
              {t.faq}
            </a>
            {user ? (
              <Button className="mt-1" render={<Link to="/app/dashboard" />}>
                {t.openDashboard}
              </Button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-xl px-3 py-2.5 text-[14px] text-neutral-300 transition-colors hover:bg-white/[0.06]"
                >
                  {t.signIn}
                </Link>
                <Button className="mt-1" render={<Link to="/register" />}>
                  {t.getStarted}
                </Button>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}

/** Miniature of the product: a project card whose tasks complete on a loop. */
function ProductVignette() {
  return (
    <div
      aria-hidden="true"
      className="loka-vignette group relative mx-auto mt-14 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414]/90 text-left shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1"
    >
      {/* Ambient glow border */}
      <div className="pointer-events-none absolute -inset-px rounded-2xl border border-indigo-500/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-neutral-800/80 px-4 py-2.5">
        <span className="size-2 rounded-full bg-neutral-700" />
        <span className="size-2 rounded-full bg-neutral-700" />
        <span className="size-2 rounded-full bg-neutral-700" />
        <span className="ml-3 text-[11px] text-neutral-500">
          LokaSync — Website redesign
        </span>
      </div>

      <div className="flex">
        {/* Mini sidebar */}
        <div className="hidden w-12 flex-col items-center gap-3 border-r border-neutral-800/80 py-4 sm:flex">
          <span className="size-5 rounded-md bg-neutral-50/90" />
          <span className="mt-2 size-4 rounded bg-neutral-800" />
          <span className="size-4 rounded bg-indigo-500/70" />
          <span className="size-4 rounded bg-neutral-800" />
          <span className="size-4 rounded bg-neutral-800" />
        </div>

        {/* Project panel */}
        <div className="min-w-0 flex-1 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] text-neutral-100">Website redesign</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Due 28 Jun · 3 members
              </p>
            </div>
            <span className="rounded-full bg-indigo-900/50 px-2.5 py-0.5 text-[10px] text-indigo-300">
              On track
            </span>
          </div>

          <div className="mt-4 h-1 overflow-hidden rounded-full bg-neutral-800">
            <div className="loka-progress h-full rounded-full bg-indigo-500" />
          </div>

          <div className="mt-4 flex flex-col divide-y divide-neutral-800/60">
            {DEMO_TASKS.map((task, i) => (
              <div
                key={task.title}
                className={`loka-task loka-task-${i + 1} flex items-center gap-3 py-2.5`}
              >
                <span className="loka-box flex size-4 shrink-0 items-center justify-center rounded border border-neutral-600">
                  <Check
                    className="loka-check size-3 text-white"
                    strokeWidth={3}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="loka-title relative inline-block max-w-full truncate align-middle text-[12.5px] text-neutral-300">
                    {task.title}
                    <span className="loka-strike absolute left-0 top-1/2 h-px w-full origin-left bg-neutral-500" />
                  </span>
                </span>
                <span className="hidden rounded bg-neutral-800/80 px-1.5 py-0.5 text-[10px] text-neutral-400 sm:block">
                  {task.tag}
                </span>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[9px] text-neutral-300">
                  {task.initials}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Social proof with animated counters. */
function SocialProof({
  lang,
}: {
  lang: Lang;
}) {
  const s = STRINGS[lang].socialProof;
  const counters = [
    { value: s.teamCount, label: s.teamLabel },
    { value: s.taskCount, label: s.taskLabel },
    { value: s.countryCount, label: s.countryLabel },
  ];
  return (
    <div className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-6 sm:gap-10">
      {counters.map((c) => (
        <div key={c.label} className="text-center">
          <div className="text-[24px] font-semibold text-neutral-100 sm:text-[28px]">{c.value}</div>
          <div className="text-[12px] text-neutral-500">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Integration logos strip. */
function IntegrationStrip({
  lang,
}: {
  lang: Lang;
}) {
  const title = STRINGS[lang].integrations.title;
  const tools = [
    { name: "Slack", color: "#E01E5A" },
    { name: "Notion", color: "#000000" },
    { name: "GitHub", color: "#FFFFFF" },
    { name: "Google Calendar", color: "#4285F4" },
    { name: "Figma", color: "#F24E1E" },
    { name: "Midtrans", color: "#0F82E4" },
  ];
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 text-center">
      <p className="text-[12px] uppercase tracking-wider text-neutral-600">{title}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-6 opacity-60 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 sm:gap-10">
        {tools.map((tool) => (
          <span
            key={tool.name}
            className="text-[13px] font-medium text-neutral-400"
            style={{ color: tool.color }}
          >
            {tool.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [lang, setLang] = useState<Lang>(detectLang);
  const t = STRINGS[lang];

  const changeLang = (next: Lang) => {
    setLang(next);
    persistLang(next);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Prices live server-side in KV `plans`; never hardcode amounts here.
  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch((e) => console.error("Failed to load plans:", e));
  }, []);

  return (
    <div
      className="dark relative min-h-screen w-full overflow-x-hidden bg-[#0f0f0f] text-neutral-50"
      style={{
        fontFamily: "Lexend, sans-serif",
        background: [
          "radial-gradient(ellipse 80% 55% at 50% -12%, rgba(99,102,241,0.16), transparent 60%)",
          "radial-gradient(ellipse 55% 45% at 108% 38%, rgba(139,92,246,0.10), transparent 65%)",
          "radial-gradient(ellipse 60% 45% at -8% 82%, rgba(99,102,241,0.08), transparent 65%)",
          "linear-gradient(180deg, #131318 0%, #0f0f0f 35%, #0f0f0f 80%, #12121a 100%)",
        ].join(", "),
      }}
    >
      <style>{`
        html { scroll-behavior: smooth; }

        /* ── Reveal on scroll ─────────────────────────────────────────── */
        .loka-reveal {
          opacity: 0;
          transform: translateY(20px);
          transition:
            opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .loka-reveal.loka-in { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          .loka-reveal { opacity: 1; transform: none; transition: none; }
          html { scroll-behavior: auto; }
        }

        /* ── Ambient glow blobs (decorative, behind content) ──────────── */
        .loka-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(90px);
          pointer-events: none;
        }
        @media (prefers-reduced-motion: no-preference) {
          .loka-blob { animation: loka-drift 22s ease-in-out infinite alternate; }
          .loka-blob-2 { animation-delay: -11s; }
        }
        @keyframes loka-drift {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(40px, 30px) scale(1.15); }
        }

        /* ── Ambient demo loop: tasks complete one by one ─────────────── */
        .loka-box { background: #6366f1; border-color: #6366f1; }
        .loka-check { opacity: 1; }
        .loka-strike { transform: scaleX(1); }
        .loka-title { color: #737373; }
        .loka-progress { width: 100%; }

        @media (prefers-reduced-motion: no-preference) {
          .loka-vignette .loka-box   { animation: loka-anim-box 14s infinite; }
          .loka-vignette .loka-check { animation: loka-anim-check 14s infinite; }
          .loka-vignette .loka-strike{ animation: loka-anim-strike 14s infinite; }
          .loka-vignette .loka-title { animation: loka-anim-title 14s infinite; }
          .loka-vignette .loka-progress { animation: loka-anim-progress 14s infinite; }

          .loka-task-1 .loka-box, .loka-task-1 .loka-check,
          .loka-task-1 .loka-strike, .loka-task-1 .loka-title { animation-delay: 0s; }
          .loka-task-2 .loka-box, .loka-task-2 .loka-check,
          .loka-task-2 .loka-strike, .loka-task-2 .loka-title { animation-delay: 2.8s; }
          .loka-task-3 .loka-box, .loka-task-3 .loka-check,
          .loka-task-3 .loka-strike, .loka-task-3 .loka-title { animation-delay: 5.6s; }
        }

        @keyframes loka-anim-box {
          0%, 12%  { background: transparent; border-color: #525252; }
          16%, 88% { background: #6366f1; border-color: #6366f1; }
          94%, 100%{ background: transparent; border-color: #525252; }
        }
        @keyframes loka-anim-check {
          0%, 12%  { opacity: 0; }
          16%, 88% { opacity: 1; }
          94%, 100%{ opacity: 0; }
        }
        @keyframes loka-anim-strike {
          0%, 12%  { transform: scaleX(0); }
          18%, 88% { transform: scaleX(1); }
          94%, 100%{ transform: scaleX(0); }
        }
        @keyframes loka-anim-title {
          0%, 12%  { color: #d4d4d4; }
          18%, 88% { color: #737373; }
          94%, 100%{ color: #d4d4d4; }
        }
        @keyframes loka-anim-progress {
          0%, 14%  { width: 34%; }
          18%, 42% { width: 56%; }
          46%, 70% { width: 78%; }
          74%, 90% { width: 100%; }
          96%, 100%{ width: 34%; }
        }
      `}</style>

      {/* Ambient glow background */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <div className="loka-blob left-1/2 top-[-120px] h-[340px] w-[520px] -translate-x-1/2 bg-indigo-600/20" />
        <div className="loka-blob loka-blob-2 right-[-140px] top-[440px] h-[300px] w-[300px] bg-indigo-500/10" />
      </div>

      <Navbar user={user} lang={lang} onLangChange={changeLang} />

      <main className="relative">
        {/* Hero — pt offsets the floating navbar */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-24 pt-36 text-center sm:pt-40">
          <Reveal>
            <p
              className="text-[12px] tracking-wide text-neutral-500"
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              loka{" "}
              <span className="text-neutral-600">
                /ˈlo·ka/ — {t.hero.eyebrow}
              </span>
            </p>
            <h1 className="mx-auto mt-5 max-w-2xl text-[40px] leading-[1.12] sm:text-[52px]">
              {t.hero.titleA}
              <br />
              <span className="bg-gradient-to-r from-indigo-300 via-neutral-50 to-neutral-50 bg-clip-text text-transparent">
                {t.hero.titleB}
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-neutral-400">
              {t.hero.sub}
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <span className="relative">
                {/* Accent glow behind the primary CTA */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-full bg-indigo-500/40 blur-xl"
                />
                <Button
                  size="lg"
                  className="transition-transform duration-150 active:scale-[0.97]"
                  render={<Link to={user ? "/app/dashboard" : "/register"} />}
                >
                  {user ? t.nav.openDashboard : t.hero.ctaPrimary}
                </Button>
              </span>
              <Button
                size="lg"
                variant="outline"
                className="transition-transform duration-150 active:scale-[0.97]"
                render={<Link to="/pricing" />}
              >
                {t.hero.ctaSecondary}
              </Button>
            </div>
            <p className="mt-4 text-[12px] text-neutral-500">{t.hero.note}</p>
          </Reveal>

          <Reveal delay={200}>
            <SocialProof lang={lang} />
          </Reveal>

          <Reveal delay={200}>
            <ProductVignette />
          </Reveal>
        </section>

        <IntegrationStrip lang={lang} />

        {/* Features — the app's actual sections */}
        <section id="features" className="border-t border-neutral-800/70">
          <div className="mx-auto w-full max-w-5xl px-6 py-20">
            <Reveal>
              <h2 className="text-[22px] text-neutral-50">
                {t.features.title}
              </h2>
              <p className="mt-2 max-w-lg text-[14px] text-neutral-400">
                {t.features.sub}
              </p>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {t.features.items.map((feature, i) => (
                <Reveal key={feature.name} delay={(i % 3) * 70}>
                  <div className="group h-full rounded-2xl border border-white/[0.06] bg-[#1a1a1a]/80 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/30 hover:bg-[#1d1d1f]">
                    <h3 className="flex items-center gap-2 text-[14px] text-neutral-100">
                      {feature.name}
                      {"pro" in feature && feature.pro && (
                        <span className="rounded-full bg-indigo-900/50 px-2 py-0.5 text-[10px] text-indigo-300">
                          Pro
                        </span>
                      )}
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500 transition-colors group-hover:text-neutral-400">
                      {feature.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials — dummy quotes until real customers replace them */}
        <section className="border-t border-neutral-800/70">
          <div className="mx-auto w-full max-w-5xl px-6 py-20">
            <Reveal>
              <h2 className="text-[22px] text-neutral-50">
                {t.testimonials.title}
              </h2>
              <p className="mt-2 max-w-lg text-[14px] text-neutral-400">
                {t.testimonials.sub}
              </p>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {t.testimonials.items.map((item, i) => (
                <Reveal key={item.name} delay={i * 80}>
                  <figure className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-[#1a1a1a]/80 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/30">
                    <span
                      aria-hidden="true"
                      className="text-[28px] leading-none text-indigo-400/70"
                    >
                      “
                    </span>
                    <blockquote className="mt-1 flex-1 text-[13.5px] leading-relaxed text-neutral-300">
                      {item.quote}
                    </blockquote>
                    <figcaption className="mt-5 flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-900/50 text-[11px] text-indigo-300">
                        {item.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <span>
                        <span className="block text-[13px] text-neutral-100">
                          {item.name}
                        </span>
                        <span className="block text-[11.5px] text-neutral-500">
                          {item.role}
                        </span>
                      </span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing strip — amounts come from the server, same source as /pricing */}
        {plans && plans.length > 0 && (
          <section className="border-t border-neutral-800/70">
            <div className="mx-auto w-full max-w-5xl px-6 py-20">
              <Reveal>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-[22px] text-neutral-50">
                      {t.pricing.title}
                    </h2>
                    <p className="mt-2 text-[14px] text-neutral-400">
                      {t.pricing.sub}
                    </p>
                  </div>
                  <Link
                    to="/pricing"
                    className="group flex items-center gap-1 text-[13px] text-neutral-300 underline-offset-4 hover:underline"
                  >
                    {t.pricing.seeFull}{" "}
                    <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </Reveal>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {plans.map((plan, i) => (
                  <Reveal key={plan.id} delay={i * 80}>
                    <div
                      className={`h-full rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 ${
                        plan.highlighted
                          ? "border-indigo-500/40 bg-indigo-950/20 hover:border-indigo-400/60"
                          : "border-white/[0.06] bg-[#1a1a1a]/80 hover:border-neutral-700"
                      }`}
                    >
                      <p className="flex items-center gap-2 text-[14px] text-neutral-100">
                        {plan.name}
                        {plan.highlighted && (
                          <span className="rounded-full bg-indigo-900/50 px-2 py-0.5 text-[10px] text-indigo-300">
                            {t.pricing.mostPopular}
                          </span>
                        )}
                      </p>
                      <p className="mt-2 text-[20px] text-neutral-50">
                        {plan.monthly === 0 ? "Rp 0" : idr.format(plan.monthly)}
                        <span className="text-[12px] text-neutral-500">
                          {" "}
                          {t.pricing.perMonth}
                        </span>
                      </p>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-500">
                        {plan.description}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>

              {/* Trust strip: Midtrans + supported VA banks */}
              <Reveal delay={160}>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 sm:flex-row sm:gap-4">
                  <span className="flex items-center gap-2 text-[12.5px] text-neutral-400">
                    <ShieldCheck
                      className="size-4 text-indigo-400"
                      aria-hidden="true"
                    />
                    {t.payments.secure}
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden h-4 w-px bg-neutral-800 sm:block"
                  />
                  <span className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-neutral-500">
                    {t.payments.via}
                    {["BCA", "BNI", "BRI", "Mandiri", "Permata"].map((bank) => (
                      <span
                        key={bank}
                        className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-neutral-300"
                      >
                        {bank}
                      </span>
                    ))}
                  </span>
                </div>
              </Reveal>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 border-t border-neutral-800/70">
          <div className="mx-auto w-full max-w-3xl px-6 py-20">
            <Reveal>
              <h2 className="text-center text-[22px] text-neutral-50">
                {t.faq.title}
              </h2>
              <p className="mt-2 text-center text-[14px] text-neutral-400">
                {t.faq.sub}
              </p>
            </Reveal>
            <Reveal delay={100}>
              <Accordion
                key={lang}
                className="mt-10 w-full"
                defaultValue={["faq-0"]}
              >
                {t.faq.items.map((item, i) => (
                  <AccordionItem
                    key={item.q}
                    value={`faq-${i}`}
                    className="border-neutral-800"
                  >
                    <AccordionTrigger className="text-[14px] text-neutral-100 hover:text-neutral-50">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionPanel className="text-[13px] leading-relaxed text-neutral-400">
                      {item.a}
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-neutral-800/70">
          <div className="mx-auto w-full max-w-5xl px-6 py-20 text-center">
            <Reveal>
              <h2 className="text-[26px] text-neutral-50">{t.cta.title}</h2>
              <p className="mx-auto mt-3 max-w-md text-[14px] text-neutral-400">
                {t.cta.sub}
              </p>
              <div className="mt-7 flex items-center justify-center">
                <span className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-full bg-indigo-500/40 blur-xl"
                  />
                  <Button
                    size="lg"
                    className="transition-transform duration-150 active:scale-[0.97]"
                    render={<Link to={user ? "/app/dashboard" : "/register"} />}
                  >
                    {user ? t.nav.openDashboard : t.cta.button}
                  </Button>
                </span>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-neutral-800/70">
        <div className="mx-auto w-full max-w-5xl px-6 pb-8 pt-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div className="lg:col-span-2">
              <Logo />
              <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-neutral-500">
                {t.footer.tagline}
              </p>
              <div className="mt-5">
                <SocialLinks />
              </div>
            </div>

            {/* Product */}
            <nav aria-label={t.footer.product}>
              <h3 className="text-[12px] uppercase tracking-wider text-neutral-500">
                {t.footer.product}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5 text-[13px]">
                <li>
                  <a
                    href="#features"
                    className="text-neutral-400 transition-colors hover:text-neutral-100"
                  >
                    {t.footer.links.features}
                  </a>
                </li>
                <li>
                  <Link
                    to="/pricing"
                    className="text-neutral-400 transition-colors hover:text-neutral-100"
                  >
                    {t.footer.links.pricing}
                  </Link>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="text-neutral-400 transition-colors hover:text-neutral-100"
                  >
                    {t.footer.links.faq}
                  </a>
                </li>
              </ul>
            </nav>

            {/* Account */}
            <nav aria-label={t.footer.account}>
              <h3 className="text-[12px] uppercase tracking-wider text-neutral-500">
                {t.footer.account}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5 text-[13px]">
                {user ? (
                  <li>
                    <Link
                      to="/app/dashboard"
                      className="text-neutral-400 transition-colors hover:text-neutral-100"
                    >
                      {t.footer.links.dashboard}
                    </Link>
                  </li>
                ) : (
                  <>
                    <li>
                      <Link
                        to="/login"
                        className="text-neutral-400 transition-colors hover:text-neutral-100"
                      >
                        {t.footer.links.signIn}
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/register"
                        className="text-neutral-400 transition-colors hover:text-neutral-100"
                      >
                        {t.footer.links.createAccount}
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </nav>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-neutral-800/70 pt-6 sm:flex-row">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
              <p className="text-[12px] text-neutral-600">
                © 2026 LokaSync. {t.footer.rights}
              </p>
              <nav className="flex items-center gap-4 text-[12px]">
                <Link
                  to="/privacy"
                  className="text-neutral-500 transition-colors hover:text-neutral-200"
                >
                  {t.footer.links.privacy}
                </Link>
                <Link
                  to="/terms"
                  className="text-neutral-500 transition-colors hover:text-neutral-200"
                >
                  {t.footer.links.terms}
                </Link>
              </nav>
            </div>
            <LangToggle lang={lang} onChange={changeLang} />
          </div>
        </div>
      </footer>
    </div>
  );
}
