import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { registerUnauthorizedHandler } from "./app/utils/api.ts";
import { supabase } from "./app/utils/supabase.ts";
import { toast } from "sonner";
import "./styles/index.css";

// Catch unhandled promise rejections (async errors outside React render).
// Suppress known auth flow rejections (e.g. OTP cancelled, token refresh race)
// by matching exact Supabase auth error messages — NOT a broad substring.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const msg = reason instanceof Error ? reason.message : String(reason ?? "");
  // Only suppress specific Supabase auth flow messages
  if (
    msg === "Auth session missing!" ||
    msg.includes("Invalid Refresh Token") ||
    msg.includes("Refresh Token Not Found")
  ) {
    return; // auth flow rejections are handled elsewhere
  }
  console.error("Unhandled promise rejection:", reason);
});

// When the server rejects a request with 401 (token expired/invalid), sign
// the user out and bounce to /login once. Reset the flag after navigation so
// a subsequent 401 on a fresh page load is still handled.
let bounced = false;
registerUnauthorizedHandler(() => {
  if (bounced) return;
  bounced = true;
  toast.error("Your session has expired. Please sign in again.");
  supabase.auth.signOut().finally(() => {
    window.location.assign("/login");
    // Reset after redirect so a fresh page load can handle its own 401
    setTimeout(() => { bounced = false; }, 2000);
  });
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);
