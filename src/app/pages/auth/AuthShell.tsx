import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/cossui/card";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  wide = false,
}: AuthShellProps) {
  return (
    <div
      className="dark flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-[#0f0f0f] px-4 py-10"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <Link to="/" aria-label="LokaSync home">
        <span className="text-lg font-bold tracking-[0.08em] text-[#fafafa]">
          LOKASYNC
        </span>
      </Link>
      <Card
        className={`w-full border-neutral-800 bg-[#1a1a1a] ${wide ? "max-w-md" : "max-w-sm"}`}
      >
        <CardHeader>
          <CardTitle className="text-[#fafafa]">{title}</CardTitle>
          {description && (
            <CardDescription className="text-neutral-400">
              {description}
            </CardDescription>
          )}
        </CardHeader>
        <CardPanel className="flex flex-col gap-4">{children}</CardPanel>
        {footer && (
          <CardFooter className="justify-center text-sm text-neutral-400">
            {footer}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}