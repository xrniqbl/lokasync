import { memo } from "react";

interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
}

interface TestimonialSectionProps {
  title: string;
  sub: string;
  items: TestimonialItem[];
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0][0];
}

const STAR = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#6366f1" className="opacity-80">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

export const TestimonialSection = memo(function TestimonialSection({ title, sub, items }: TestimonialSectionProps) {
  return (
    <section className="border-t border-neutral-800/70">
      <div className="mx-auto w-full max-w-5xl px-6 py-20">
        <div>
          <h2 className="text-[22px] text-neutral-50">{title}</h2>
          <p className="mt-2 max-w-lg text-[14px] text-neutral-400">{sub}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div
              key={item.name}
              className="flex h-full flex-col rounded-2xl border border-neutral-800/60 bg-[#1a1a1a]/80 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/30"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-0.5 mb-3">
                {STAR}{STAR}{STAR}{STAR}{STAR}
              </div>
              <blockquote className="flex-1 text-[13px] leading-relaxed text-neutral-300 border-l-2 border-indigo-500/30 pl-3">
                {item.quote}
              </blockquote>
              <div className="mt-5 flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-900/50 text-[11px] text-indigo-300">
                  {getInitials(item.name)}
                </span>
                <span>
                  <span className="block text-[13px] text-neutral-100">{item.name}</span>
                  <span className="block text-[11px] text-neutral-500">{item.role}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});
