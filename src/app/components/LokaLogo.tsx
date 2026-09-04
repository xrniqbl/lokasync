import { Link } from "react-router";

/**
 * LokaSync logo component — shows the icon mark only by default.
 * Used across the landing page, auth shell, checkout, pricing, legal, admin,
 * and maintenance screens.
 *
 * @param size  - Controls the icon height (default "md").
 * @param link  - Whether to wrap in a link to "/" (default true).
 * @param showWordmark - Show the "LOKASYNC" text next to the icon (default false).
 */
export function LokaLogo({
  size = "md",
  link = true,
  showWordmark = false,
}: {
  size?: "sm" | "md" | "lg" | "icon";
  link?: boolean;
  showWordmark?: boolean;
}) {
  // Logo-only by default, so the marks are sized up to stay legible without
  // the wordmark beside them.
  const iconSize = {
    sm: "size-8",
    md: "size-10",
    lg: "size-12",
    icon: "size-9",
  }[size];

  const textSize = {
    sm: "text-[14px]",
    md: "text-[15px]",
    lg: "text-[17px]",
    icon: "text-[11px]",
  }[size];

  const content = (
    <span className="inline-flex items-center gap-2">
      <img
        src="/lokasynclogo.png"
        alt="LokaSync"
        width={40}
        height={40}
        className={`${iconSize} object-contain`}
      />
      {showWordmark && (
        <span
          className={`font-bold tracking-[0.08em] text-[#fafafa] ${textSize}`}
        >
          LOKASYNC
        </span>
      )}
    </span>
  );

  if (!link) return content;

  return (
    <Link to="/" aria-label="LokaSync home">
      {content}
    </Link>
  );
}
