import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { AppLayout } from "./AppLayout";
import { AuthProvider } from "./auth/AuthContext";
import { RedirectIfAuthed, RequireAuth, RequireProfile } from "./auth/guards";
import { SubscriptionProvider } from "./subscription/SubscriptionContext";
import { LangProvider } from "./i18n";
import { LandingPage } from "./pages/LandingPage";

// Route-level code splitting: each page becomes its own chunk so the first
// paint only downloads the landing shell. LandingPage stays eager (LCP).
const PricingPage = lazy(() => import("./pages/PricingPage").then((m) => ({ default: m.PricingPage })));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/legal/TermsPage").then((m) => ({ default: m.TermsPage })));
const LoginPage = lazy(() => import("./pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })));
const InvitePage = lazy(() => import("./pages/InvitePage").then((m) => ({ default: m.InvitePage })));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage })));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage").then((m) => ({ default: m.CheckoutPage })));
const PaymentStatusPage = lazy(() => import("./pages/PaymentStatusPage").then((m) => ({ default: m.PaymentStatusPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

function PageFallback() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#0f0f0f]" aria-busy="true" aria-label="Loading page">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-500" />
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
    <AuthProvider>
      <SubscriptionProvider>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Landing (public) */}
        <Route path="/" element={<LandingPage />} />

        {/* Pricing (public) */}
        <Route path="/pricing" element={<PricingPage />} />

        {/* Legal (public) */}
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* Auth (public) */}
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthed>
              <RegisterPage />
            </RedirectIfAuthed>
          }
        />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/forgot-password"
          element={
            <RedirectIfAuthed>
              <ForgotPasswordPage />
            </RedirectIfAuthed>
          }
        />
        {/* Reset password needs the recovery session, so no RedirectIfAuthed */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Workspace invitation links (public preview; accept requires auth) */}
        <Route path="/invite/:token" element={<InvitePage />} />

        {/* App (protected) */}
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/checkout/:planId"
          element={
            <RequireAuth>
              <RequireProfile>
                <CheckoutPage />
              </RequireProfile>
            </RequireAuth>
          }
        />
        {/* Redirect/result pages from Midtrans Snap — status comes from polling */}
        {["finish", "pending", "error"].map((slug) => (
          <Route
            key={slug}
            path={`/payment/${slug}`}
            element={
              <RequireAuth>
                <PaymentStatusPage />
              </RequireAuth>
            }
          />
        ))}
        <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />

        {/* Founder panel — AdminPage itself 404s for non-admins */}
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route
          path="/app/:section/:sub?"
          element={
            <RequireAuth>
              <RequireProfile>
                <AppLayout />
              </RequireProfile>
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
        </SubscriptionProvider>
      </AuthProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#1a1a1a",
            border: "1px solid #262626",
            color: "#fafafa",
            fontFamily: "Lexend, sans-serif",
            fontSize: "13px",
          },
        }}
      />
    </LangProvider>
  );
}
