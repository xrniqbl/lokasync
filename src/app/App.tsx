import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { LangProvider } from "./LangContext";
import { AppearanceProvider } from "./AppearanceContext";
import { AppLayout } from "./AppLayout";
import { AuthProvider } from "./auth/AuthContext";
import { RedirectIfAuthed, RequireAuth, RequireProfile } from "./auth/guards";
import { SubscriptionProvider } from "./subscription/SubscriptionContext";

// ── Lazy-loaded pages — only downloaded when the route is visited ──────────
const LandingPage = lazy(() => import("./pages/LandingPage").then(m => ({ default: m.LandingPage })));
const PricingPage = lazy(() => import("./pages/PricingPage").then(m => ({ default: m.PricingPage })));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage").then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/legal/TermsPage").then(m => ({ default: m.TermsPage })));
const LoginPage = lazy(() => import("./pages/auth/LoginPage").then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage").then(m => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage").then(m => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage").then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage").then(m => ({ default: m.OnboardingPage })));
const JoinWorkspacePage = lazy(() => import("./pages/JoinWorkspacePage").then(m => ({ default: m.JoinWorkspacePage })));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage").then(m => ({ default: m.CheckoutPage })));
const PaymentStatusPage = lazy(() => import("./pages/PaymentStatusPage").then(m => ({ default: m.PaymentStatusPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then(m => ({ default: m.AdminPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then(m => ({ default: m.NotFoundPage })));
const BlogListPage = lazy(() => import("./pages/blog/BlogListPage").then(m => ({ default: m.BlogListPage })));
const BlogArticlePage = lazy(() => import("./pages/blog/BlogArticlePage").then(m => ({ default: m.BlogArticlePage })));

function PageLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0f0f0f]" style={{ fontFamily: "Lexend, sans-serif" }}>
      <div className="w-6 h-6 border-2 border-neutral-700 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
    <AuthProvider>
      <AppearanceProvider>
      <SubscriptionProvider>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Landing (public) */}
        <Route path="/" element={<LandingPage />} />

        {/* Pricing (public) */}
        <Route path="/pricing" element={<PricingPage />} />

        {/* Legal (public) */}
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* Blog (public) */}
        <Route path="/blog" element={<BlogListPage />} />
        <Route path="/blog/:slug" element={<BlogArticlePage />} />

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

        {/* App (protected) */}
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />
        {/* Accept a workspace invitation — needs auth, but not a complete profile */}
        <Route
          path="/join/:token"
          element={
            <RequireAuth>
              <JoinWorkspacePage />
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
      </AppearanceProvider>
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
    </AuthProvider>
    </LangProvider>
  );
}
