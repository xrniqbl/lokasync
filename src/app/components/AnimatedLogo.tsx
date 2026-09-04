import { useEffect, useState } from "react";

/**
 * Animated LokaSync logo for the hero section.
 *
 * - Logo icon scales in with a spring bounce
 * - Subtle indigo glow fades in behind
 * - Gentle floating loop after entrance
 *
 * Respects prefers-reduced-motion (shows instantly).
 */
export function AnimatedLogo() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className="loka-anim-logo" aria-label="LokaSync">
      {/* Glow */}
      <div className="loka-anim-glow" aria-hidden="true" />

      {/* Icon */}
      <div className={`loka-anim-icon ${mounted ? "loka-anim-in" : ""}`}>
        <img
          src="/lokasynclogo.png"
          alt=""
          width={40}
          height={40}
          className="size-9 object-contain sm:size-10"
          aria-hidden="true"
        />
      </div>

      <style>{`
        .loka-anim-logo {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 0;
        }

        /* ── Glow ─────────────────────────────────────────── */
        .loka-anim-glow {
          position: absolute;
          inset: -24px;
          border-radius: 9999px;
          background: radial-gradient(
            circle,
            rgba(99, 102, 241, 0.18) 0%,
            rgba(99, 102, 241, 0.04) 50%,
            transparent 70%
          );
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.8s ease-out 0.2s;
        }
        .loka-anim-logo:has(.loka-anim-in) .loka-anim-glow {
          opacity: 1;
        }

        /* ── Icon entrance ────────────────────────────────── */
        .loka-anim-icon {
          opacity: 0;
          transform: scale(0.5) translateY(6px);
          transition:
            opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .loka-anim-icon.loka-anim-in {
          opacity: 1;
          transform: scale(1) translateY(0);
        }

        /* Float loop after entrance */
        @media (prefers-reduced-motion: no-preference) {
          .loka-anim-icon.loka-anim-in {
            animation: loka-logo-float 5s ease-in-out 0.8s infinite;
          }
          @keyframes loka-logo-float {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-3px); }
          }
        }

        /* ── Reduced motion ───────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .loka-anim-icon {
            opacity: 1;
            transform: none;
            transition: none;
          }
          .loka-anim-glow {
            opacity: 1;
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
