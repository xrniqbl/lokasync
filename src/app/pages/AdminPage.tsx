import { logger } from "../utils/logger";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { LokaLogo } from "../components/LokaLogo";
import { useLang } from "../LangContext";
import {
  ArrowLeft,
  BellRing,
  LayoutDashboard,
  Ticket,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/cossui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/cossui/card";
import { Checkbox } from "@/components/cossui/checkbox";
import { Field, FieldLabel } from "@/components/cossui/field";
import { Input } from "@/components/cossui/input";
import { Label } from "@/components/cossui/label";
import { Spinner } from "@/components/cossui/spinner";
import { Textarea } from "@/components/cossui/textarea";
import { useSubscription } from "../subscription/SubscriptionContext";
import * as api from "../utils/api";
import { NotFoundPage } from "./NotFoundPage";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateFmt = (lang: "en" | "id") =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

type Tab = "overview" | "vouchers" | "subscribers" | "maintenance" | "notifications";

const TABS: { id: Tab; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", labelKey: "admin.tabOverview", icon: LayoutDashboard },
  { id: "vouchers", labelKey: "admin.tabVouchers", icon: Ticket },
  { id: "subscribers", labelKey: "admin.tabSubscribers", icon: Users },
  { id: "maintenance", labelKey: "admin.tabMaintenance", icon: Wrench },
  { id: "notifications", labelKey: "admin.tabNotifications", icon: BellRing },
];

/* ── Overview ─────────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#1a1a1a] p-4">
      <p className="text-[12px] text-neutral-500">{label}</p>
      <p className="mt-1 text-[20px] text-neutral-50">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function OverviewTab() {
  const { t, lang } = useLang();
  const [data, setData] = useState<api.AdminOverview | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    api
      .adminGetOverview()
      .then(setData)
      .catch((e) => {
        logger.error("app", "Failed to load overview:", e);
        setError(true);
      });
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <p className="py-12 text-center text-[13px] text-neutral-500">
        {t("admin.overviewFailed")}{" "}
        <button onClick={load} className="text-indigo-400 hover:underline">
          {t("admin.retry")}
        </button>
      </p>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-neutral-400" />
      </div>
    );
  }

  const activePro = data.active_subscriptions.pro ?? 0;
  const activeBusiness = data.active_subscriptions.business ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {data.maintenance.enabled && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-[13px] text-amber-200">
          {t("admin.maintenanceOnNotice")}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.registeredUsers")} value={String(data.total_users)} />
        <StatCard
          label={t("admin.activeSubscriptions")}
          value={String(activePro + activeBusiness)}
          sub={`${activePro} Pro · ${activeBusiness} Business`}
        />
        <StatCard label={t("admin.expiredSubscriptions")} value={String(data.expired_subscriptions)} />
        <StatCard label={t("admin.tabVouchers")} value={String(data.voucher_count)} />
        <StatCard
          label={t("admin.totalRevenue")}
          value={idr.format(data.revenue_total)}
          sub={t("admin.paidPayments").replace("{count}", String(data.paid_transactions))}
        />
        <StatCard label={t("admin.pendingPayments")} value={String(data.pending_transactions)} />
      </div>
    </div>
  );
}

/* ── Vouchers ─────────────────────────────────────────────────────────────── */

const EMPTY_VOUCHER_FORM = {
  code: "",
  type: "percent" as "percent" | "fixed",
  value: "",
  max_uses: "",
  expires_at: "",
  pro: true,
  business: true,
};

function VouchersTab() {
  const { t, lang } = useLang();
  const [vouchers, setVouchers] = useState<api.Voucher[] | null>(null);
  const [form, setForm] = useState(EMPTY_VOUCHER_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .adminGetVouchers()
      .then(setVouchers)
      .catch((e) => {
        logger.error("app", "Failed to load vouchers:", e);
        toast.error(t("admin.failedToLoadVouchers"));
      });
  }, [t]);

  useEffect(load, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Both plans checked = applies to everything → store null (all plans)
      const applies_to =
        form.pro && form.business
          ? null
          : [form.pro && "pro", form.business && "business"].filter(Boolean) as string[];
      if (applies_to && applies_to.length === 0) {
        toast.error(t("admin.pickPlan"));
        return;
      }
      const created = await api.adminCreateVoucher({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        applies_to,
      });
      setVouchers((prev) => (prev ? [created, ...prev] : [created]));
      setForm(EMPTY_VOUCHER_FORM);
      toast.success(t("admin.voucherCreated").replace("{code}", created.code));
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToCreateVoucher"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (voucher: api.Voucher) => {
    try {
      const updated = await api.adminUpdateVoucher(voucher.code, {
        active: !voucher.active,
      });
      setVouchers((prev) =>
        prev ? prev.map((v) => (v.code === updated.code ? updated : v)) : prev,
      );
      toast.success(
        updated.active
          ? t("admin.voucherActivated").replace("{code}", updated.code)
          : t("admin.voucherDeactivated").replace("{code}", updated.code),
      );
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToUpdateVoucher"));
    }
  };

  const remove = async (voucher: api.Voucher) => {
    if (!window.confirm(t("admin.deleteVoucherConfirm").replace("{code}", voucher.code))) return;
    try {
      await api.adminDeleteVoucher(voucher.code);
      setVouchers((prev) => (prev ? prev.filter((v) => v.code !== voucher.code) : prev));
      toast.success(t("admin.voucherDeleted").replace("{code}", voucher.code));
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToDeleteVoucher"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-neutral-800 bg-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-neutral-50">{t("admin.newVoucher")}</CardTitle>
          <CardDescription className="text-neutral-400">
            {t("admin.newVoucherDesc")}
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("admin.code")}</FieldLabel>
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="LAUNCH30"
                required
              />
            </Field>
            <Field>
              <FieldLabel>{t("admin.type")}</FieldLabel>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as "percent" | "fixed" })
                }
                className="h-9 rounded-lg border border-neutral-700 bg-[#141414] px-3 text-[13px] text-neutral-100 outline-none focus:border-neutral-500"
              >
                <option value="percent">{t("admin.percent")}</option>
                <option value="fixed">{t("admin.fixed")}</option>
              </select>
            </Field>
            <Field>
              <FieldLabel>
                {form.type === "percent" ? t("admin.discountPercent") : t("admin.discountRp")}
              </FieldLabel>
              <Input
                type="number"
                min="1"
                max={form.type === "percent" ? 100 : undefined}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder={form.type === "percent" ? "30" : "50000"}
                required
              />
            </Field>
            <Field>
              <FieldLabel>
                {t("admin.maxUses")} <span className="font-normal text-neutral-500">{t("onboarding.optional")}</span>
              </FieldLabel>
              <Input
                type="number"
                min="1"
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                placeholder={t("admin.unlimited")}
              />
            </Field>
            <Field>
              <FieldLabel>
                {t("admin.expires")} <span className="font-normal text-neutral-500">{t("onboarding.optional")}</span>
              </FieldLabel>
              <Input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-neutral-200">{t("admin.appliesTo")}</span>
              <div className="flex items-center gap-4 pt-1">
                <span className="flex items-center gap-2">
                  <Checkbox
                    id="v-pro"
                    checked={form.pro}
                    onCheckedChange={(v) => setForm({ ...form, pro: v === true })}
                  />
                  <Label htmlFor="v-pro" className="text-[13px] text-neutral-300">
                    Pro
                  </Label>
                </span>
                <span className="flex items-center gap-2">
                  <Checkbox
                    id="v-business"
                    checked={form.business}
                    onCheckedChange={(v) => setForm({ ...form, business: v === true })}
                  />
                  <Label htmlFor="v-business" className="text-[13px] text-neutral-300">
                    Business
                  </Label>
                </span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" loading={saving}>
                {t("admin.createVoucher")}
              </Button>
            </div>
          </form>
        </CardPanel>
      </Card>

      <Card className="border-neutral-800 bg-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-neutral-50">{t("admin.allVouchers")}</CardTitle>
        </CardHeader>
        <CardPanel>
          {!vouchers ? (
            <div className="flex justify-center py-10">
              <Spinner className="size-5 text-neutral-400" />
            </div>
          ) : vouchers.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-neutral-500">
              {t("admin.noVouchers")}
            </p>
          ) : (
            <div className="divide-y divide-neutral-800/70">
              {vouchers.map((v) => (
                <div key={v.code} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] text-neutral-100">
                        {v.code}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          v.active
                            ? "bg-emerald-950/60 text-emerald-400"
                            : "bg-neutral-800 text-neutral-500"
                        }`}
                      >
                        {v.active ? t("admin.active") : t("admin.inactive")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-neutral-500">
                      {v.type === "percent"
                        ? t("admin.percentOff").replace("{value}", String(v.value))
                        : t("admin.amountOff").replace("{amount}", idr.format(v.value))}
                      {" · "}
                      {t("admin.usedCount").replace(
                        "{count}",
                        String(v.used_count ?? 0) + (v.max_uses != null ? ` / ${v.max_uses}` : ""),
                      )}
                      {v.expires_at
                        ? ` · ${t("admin.expiresOn").replace("{date}", dateFmt(lang).format(new Date(v.expires_at)))}`
                        : ""}
                      {" · "}
                      {v.applies_to ? v.applies_to.join(", ") : t("admin.allPaidPlans")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(v)}>
                    {v.active ? t("admin.deactivate") : t("admin.activate")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    aria-label={t("admin.deleteAria").replace("{name}", v.code)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-950/40 hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}

/* ── Subscribers ──────────────────────────────────────────────────────────── */

function SubscribersTab() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<api.SubscriberRow[] | null>(null);

  useEffect(() => {
    api
      .adminGetSubscribers()
      .then(setRows)
      .catch((e) => {
        logger.error("app", "Failed to load subscribers:", e);
        toast.error(t("admin.failedToLoadSubscribers"));
      });
  }, [t]);

  if (!rows) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-neutral-400" />
      </div>
    );
  }

  return (
    <Card className="border-neutral-800 bg-[#1a1a1a]">
      <CardHeader>
        <CardTitle className="text-neutral-50">{t("admin.subscribers")}</CardTitle>
        <CardDescription className="text-neutral-400">
          {t("admin.subscribersDesc")}
        </CardDescription>
      </CardHeader>
      <CardPanel>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-neutral-500">
            {t("admin.noSubscribers")}
          </p>
        ) : (
          <div className="divide-y divide-neutral-800/70">
            {rows.map((row) => (
              <div key={row.user_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-neutral-100">
                    {row.full_name || row.email}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-neutral-500">
                    {row.email}
                    {row.company ? ` · ${row.company}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-indigo-900/50 px-2.5 py-0.5 text-[11px] capitalize text-indigo-300">
                  {row.plan_id} · {row.interval}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                    row.status === "active"
                      ? "bg-emerald-950/60 text-emerald-400"
                      : "bg-neutral-800 text-neutral-500"
                  }`}
                >
                  {row.status}
                </span>
                <span className="text-[11.5px] text-neutral-500">
                  {t("admin.until").replace("{date}", dateFmt(lang).format(new Date(row.current_period_end)))}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardPanel>
    </Card>
  );
}

/* ── Maintenance ──────────────────────────────────────────────────────────── */

function MaintenanceTab() {
  const { t } = useLang();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getServiceStatus()
      .then(({ maintenance }) => {
        setEnabled(maintenance.enabled);
        setMessage(maintenance.message);
        setLoaded(true);
      })
      .catch((e) => {
        logger.error("app", "Failed to load status:", e);
        toast.error(t("admin.failedToLoadMaintenance"));
      });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { maintenance } = await api.adminSetMaintenance({ enabled, message });
      setEnabled(maintenance.enabled);
      toast.success(maintenance.enabled ? t("admin.maintenanceOn") : t("admin.maintenanceOff"));
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-neutral-400" />
      </div>
    );
  }

  return (
    <Card className="border-neutral-800 bg-[#1a1a1a]">
      <CardHeader>
        <CardTitle className="text-neutral-50">{t("admin.maintenanceTitle")}</CardTitle>
        <CardDescription className="text-neutral-400">
          {t("admin.maintenanceDesc")}
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="mt-enabled"
            checked={enabled}
            onCheckedChange={(v) => setEnabled(v === true)}
          />
          <Label htmlFor="mt-enabled" className="text-[13px] text-neutral-200">
            {t("admin.enableMaintenance")}
          </Label>
        </div>
        <Field>
          <FieldLabel>
            {t("admin.maintenanceMessage")}{" "}
            <span className="font-normal text-neutral-500">{t("onboarding.optional")}</span>
          </FieldLabel>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("admin.maintenanceMessagePlaceholder")}
            rows={3}
          />
        </Field>
        <div>
          <Button onClick={save} loading={saving}>
            {t("admin.save")}
          </Button>
        </div>
      </CardPanel>
    </Card>
  );
}

/* ── Notifications ────────────────────────────────────────────────────────── */

const AUDIENCES = [
  { value: "all", labelKey: "admin.audienceAll" },
  { value: "free", labelKey: "admin.audienceFree" },
  { value: "pro", labelKey: "admin.audiencePro" },
  { value: "business", labelKey: "admin.audienceBusiness" },
] as const;

function NotificationsTab() {
  const { t, lang } = useLang();
  const [items, setItems] = useState<api.AdminNotification[] | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] =
    useState<api.AdminNotification["audience"]>("all");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api
      .adminGetNotifications()
      .then(setItems)
      .catch((e) => {
        logger.error("app", "Failed to load notifications:", e);
        toast.error(t("admin.failedToLoadNotifications"));
      });
  }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const created = await api.adminCreateNotification({ title, message, audience });
      setItems((prev) => (prev ? [created, ...prev] : [created]));
      setTitle("");
      setMessage("");
      toast.success(t("admin.notificationSent"));
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToSend"));
    } finally {
      setSending(false);
    }
  };

  const remove = async (item: api.AdminNotification) => {
    if (!window.confirm(t("admin.deleteNotificationConfirm").replace("{title}", item.title))) return;
    try {
      await api.adminDeleteNotification(item.id);
      setItems((prev) => (prev ? prev.filter((n) => n.id !== item.id) : prev));
      toast.success(t("admin.notificationDeleted"));
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToDelete"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-neutral-800 bg-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-neutral-50">{t("admin.sendNotification")}</CardTitle>
          <CardDescription className="text-neutral-400">
            {t("admin.sendNotificationDesc")}
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <form onSubmit={send} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("admin.title")}</FieldLabel>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("admin.notificationTitlePlaceholder")}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("admin.audience")}</FieldLabel>
                <select
                  value={audience}
                  onChange={(e) =>
                    setAudience(e.target.value as api.AdminNotification["audience"])
                  }
                  className="h-9 rounded-lg border border-neutral-700 bg-[#141414] px-3 text-[13px] text-neutral-100 outline-none focus:border-neutral-500"
                >
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {t(a.labelKey)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field>
              <FieldLabel>{t("admin.message")}</FieldLabel>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("admin.notificationMessagePlaceholder")}
                rows={3}
                required
              />
            </Field>
            <div>
              <Button type="submit" loading={sending}>
                {t("admin.sendNotificationBtn")}
              </Button>
            </div>
          </form>
        </CardPanel>
      </Card>

      <Card className="border-neutral-800 bg-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-neutral-50">{t("admin.sentNotifications")}</CardTitle>
        </CardHeader>
        <CardPanel>
          {!items ? (
            <div className="flex justify-center py-10">
              <Spinner className="size-5 text-neutral-400" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-neutral-500">
              {t("admin.nothingSent")}
            </p>
          ) : (
            <div className="divide-y divide-neutral-800/70">
              {items.map((n) => (
                <div key={n.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-neutral-100">{n.title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
                      {n.message}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-600">
                      {dateFmt(lang).format(new Date(n.created_at))} ·{" "}
                      {AUDIENCES.find((a) => a.value === n.audience)
                        ? t(AUDIENCES.find((a) => a.value === n.audience)!.labelKey)
                        : n.audience}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(n)}
                    aria-label={t("admin.deleteAria").replace("{name}", n.title)}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-950/40 hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}

/* ── Page shell ───────────────────────────────────────────────────────────── */

export function AdminPage() {
  const { isAdmin, loading } = useSubscription();
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("overview");

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <Spinner className="size-6 text-neutral-400" />
      </div>
    );
  }

  // Don't advertise that the route exists to non-admins
  if (!isAdmin) return <NotFoundPage />;

  return (
    <div
      className="dark min-h-screen w-full bg-[#0f0f0f] text-neutral-50"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <header className="border-b border-neutral-800/70">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <LokaLogo size="sm" />
            <span className="rounded-full bg-indigo-900/50 px-2.5 py-0.5 text-[11px] text-indigo-300">
              {t("admin.founderPanel")}
            </span>
          </div>
          <Link
            to="/app/dashboard"
            className="flex items-center gap-1.5 text-[13px] text-neutral-400 transition-colors hover:text-neutral-100"
          >
            <ArrowLeft className="size-3.5" />
            {t("admin.backToApp")}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <nav className="flex flex-wrap gap-2" aria-label={t("admin.panelSectionsAria")}>
          {TABS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[13px] transition-colors ${
                tab === id
                  ? "bg-neutral-50 text-neutral-900"
                  : "border border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
              }`}
            >
              <Icon className="size-3.5" />
              {t(labelKey)}
            </button>
          ))}
        </nav>

        <div className="mt-6">
          {tab === "overview" && <OverviewTab />}
          {tab === "vouchers" && <VouchersTab />}
          {tab === "subscribers" && <SubscribersTab />}
          {tab === "maintenance" && <MaintenanceTab />}
          {tab === "notifications" && <NotificationsTab />}
        </div>
      </main>
    </div>
  );
}
