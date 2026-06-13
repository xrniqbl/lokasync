import { Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { AppLayout } from "./AppLayout";
import { AuthProvider } from "./auth/AuthContext";
import { RedirectIfAuthed, RequireAuth, RequireProfile } from "./auth/guards";
import { SubscriptionProvider } from "./subscription/SubscriptionContext";
import { LangProvider } from "./i18n";
import { AdminPage } from "./pages/AdminPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { InvitePage } from "./pages/InvitePage";
import { LandingPage } from "./pages/LandingPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PaymentStatusPage } from "./pages/PaymentStatusPage";
import { PricingPage } from "./pages/PricingPage";
import { PrivacyPage } from "./pages/legal/PrivacyPage";
import { TermsPage } from "./pages/legal/TermsPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  return (
    <LangProvider>
    <AuthProvider>
      <SubscriptionProvider>
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
