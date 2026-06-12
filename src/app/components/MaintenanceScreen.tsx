import { useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/cossui/button";

/** Full-screen takeover shown to non-admin users while maintenance is on. */
export function MaintenanceScreen({ message }: { message: string }) {
  const [checking, setChecking] = useState(false);

  return (
    <div
      className="dark flex min-h-screen w-full flex-col items-center justify-center gap-5 bg-[#0f0f0f] px-6 text-center"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <span className="text-[15px] font-bold tracking-[0.08em] text-[#fafafa]">
        LOKASYNC
      </span>
      <div className="flex size-14 items-center justify-center rounded-full bg-amber-950/50">
        <Wrench className="size-6 text-amber-400" />
      </div>
      <div>
        <h1 className="text-[20px] text-neutral-50">
          We&apos;ll be right back
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-neutral-400">
          {message ||
            "LokaSync is briefly down for maintenance. Your data is safe — please check back soon."}
        </p>
      </div>
      <Button
        variant="outline"
        loading={checking}
        onClick={() => {
          setChecking(true);
          window.location.reload();
        }}
      >
        Check again
      </Button>
    </div>
  );
}
