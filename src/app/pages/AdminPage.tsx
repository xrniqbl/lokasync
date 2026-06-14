import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  BellRing,
  Database,
  LayoutDashboard,
  MailWarning,
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
import { useLang } from "../i18n";
import * as api from "../utils/api";
import { NotFoundPage } from "./NotFoundPage";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type Tab =
  | "overview"
  | "vouchers"
  | "subscribers"
  | "maintenance"
  | "notifications"
  | "migration";

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "vouchers", label: "Vouchers", icon: Ticket },
  { id: "subscribers", label: "Subscribers", icon: Users },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "migration", label: "Migration", icon: Database },
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
  const { t } = useLang();
  const [data, setData] = useState<api.AdminOverview | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    api
      .adminGetOverview()
      .then(setData)
      .catch((e) => {
        console.error("Failed to load overview:", e);
        setError(true);
      });
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <p className="py-12 text-center text-[13px] text-neutral-500">
        {t("admin.couldNotLoadOverview")}{" "}
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
          {t("admin.maintenanceModeOn")}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.registeredUsers")} value={String(data.total_users)} />
        <StatCard
          label={t("admin.activeSubscriptions")}
          value={String(activePro + activeBusiness)}
          sub={`${activePro} ${t("admin.proBusiness").split(" · ")[0]} · ${activeBusiness} ${t("admin.proBusiness").split(" · ")[1]}`}
        />
        <StatCard label={t("admin.expiredSubscriptions")} value={String(data.expired_subscriptions)} />
        <StatCard label={t("admin.vouchers")} value={String(data.voucher_count)} />
        <StatCard
          label={t("admin.totalRevenueSettled")}
          value={idr.format(data.revenue_total)}
          sub={`${data.paid_transactions} ${t("admin.paidPayments")}`}
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
  const { t } = useLang();
  const [vouchers, setVouchers] = useState<api.Voucher[] | null>(null);
  const [form, setForm] = useState(EMPTY_VOUCHER_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .adminGetVouchers()
      .then(setVouchers)
      .catch((e) => {
        console.error("Failed to load vouchers:", e);
        toast.error(t("admin.failedToLoadVouchers"));
      });
  }, []);

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
        toast.error(t("admin.pickAtLeastOnePlan"));
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
      toast.success(t("admin.voucherCreated", { code: created.code }));
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
      toast.success(updated.active ? t("admin.voucherActivated", { code: updated.code }) : t("admin.voucherDeactivated", { code: updated.code }));
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToUpdateVoucher"));
    }
  };

  const remove = async (voucher: api.Voucher) => {
    if (!window.confirm(t("admin.deleteVoucherConfirm", { code: voucher.code }))) return;
    try {
      await api.adminDeleteVoucher(voucher.code);
      setVouchers((prev) => (prev ? prev.filter((v) => v.code !== voucher.code) : prev));
      toast.success(t("admin.voucherDeleted", { code: voucher.code }));
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
            {t("admin.vouchersDesc")}
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
                <option value="percent">{t("admin.percentType")}</option>
                <option value="fixed">{t("admin.fixedAmountType")}</option>
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
                {t("admin.maxUses")} <span className="font-normal text-neutral-500">{t("profile.optional")}</span>
              </FieldLabel>
              <Input
                type="number"
                min="1"
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                placeholder="Unlimited"
              />
            </Field>
            <Field>
              <FieldLabel>
                {t("admin.expires")} <span className="font-normal text-neutral-500">{t("profile.optional")}</span>
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
              {t("admin.noVouchersYet")}
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
                      {v.type === "percent" ? `${v.value}% ${t("admin.off")}` : `${idr.format(v.value)} ${t("admin.off")}`}
                      {" · "}
                      {t("admin.used")} {v.used_count ?? 0}
                      {v.max_uses != null ? ` / ${v.max_uses}` : ""}
                      {v.expires_at
                        ? ` · ${t("admin.expires")} ${dateFmt.format(new Date(v.expires_at))}`
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
                    aria-label={`Delete ${v.code}`}
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
  const { t } = useLang();
  const [rows, setRows] = useState<api.SubscriberRow[] | null>(null);

  useEffect(() => {
    api
      .adminGetSubscribers()
      .then(setRows)
      .catch((e) => {
        console.error("Failed to load subscribers:", e);
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
        <CardTitle className="text-neutral-50">{t("admin.subscribersTitle")}</CardTitle>
        <CardDescription className="text-neutral-400">
          {t("admin.subscribersDesc")}
        </CardDescription>
      </CardHeader>
      <CardPanel>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-neutral-500">
            {t("admin.noSubscribersYet")}
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
                  {t("admin.until")} {dateFmt.format(new Date(row.current_period_end))}
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
        console.error("Failed to load status:", e);
        toast.error(t("admin.failedToLoadMaintenanceStatus"));
      });
  }, [t]);

  const save = async () => {
    setSaving(true);
    try {
      const { maintenance } = await api.adminSetMaintenance({ enabled, message });
      setEnabled(maintenance.enabled);
      toast.success(
        maintenance.enabled ? t("admin.maintenanceOn") : t("admin.maintenanceOff"),
      );
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToSaveMaintenance"));
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
        <CardTitle className="text-neutral-50">{t("admin.maintenanceMode")}</CardTitle>
        <CardDescription className="text-neutral-400">
          {t("admin.maintenanceModeDesc")}
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
            {t("admin.enableMaintenanceMode")}
          </Label>
        </div>
        <Field>
          <FieldLabel>
            Message shown to users{" "}
            <span className="font-normal text-neutral-500">(optional)</span>
          </FieldLabel>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="We are upgrading LokaSync and will be back within the hour."
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
  { value: "all", label: "All users" },
  { value: "free", label: "Free plan" },
  { value: "pro", label: "Pro plan" },
  { value: "business", label: "Business plan" },
] as const;

function NotificationsTab() {
  const { t } = useLang();
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
        console.error("Failed to load notifications:", e);
        toast.error(t("admin.failedToLoadNotifications"));
      });
  }, [t]);

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
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToSendNotification"));
    } finally {
      setSending(false);
    }
  };

  const remove = async (item: api.AdminNotification) => {
    if (!window.confirm(t("admin.deleteNotificationConfirm", { title: item.title }))) return;
    try {
      await api.adminDeleteNotification(item.id);
      setItems((prev) => (prev ? prev.filter((n) => n.id !== item.id) : prev));
      toast.success(t("admin.notificationDeleted"));
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.failedToDeleteNotification"));
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
                <FieldLabel>{t("admin.notificationTitle")}</FieldLabel>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Scheduled maintenance this Sunday"
                  required
                />
              </Field>
              <Field>
                <FieldLabel>Audience</FieldLabel>
                <select
                  value={audience}
                  onChange={(e) =>
                    setAudience(e.target.value as api.AdminNotification["audience"])
                  }
                  className="h-9 rounded-lg border border-neutral-700 bg-[#141414] px-3 text-[13px] text-neutral-100 outline-none focus:border-neutral-500"
                >
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.value === "all" ? t("admin.audienceAll") :
                       a.value === "free" ? t("admin.audienceFree") :
                       a.value === "pro" ? t("admin.audiencePro") :
                       t("admin.audienceBusiness")}
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
                placeholder="LokaSync will be briefly unavailable on Sunday 02:00–03:00 WIB."
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
              {t("admin.nothingSentYet")}
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
                      {dateFmt.format(new Date(n.created_at))} ·{" "}
                      {AUDIENCES.find((a) => a.value === n.audience)?.label ?? n.audience}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(n)}
                    aria-label={`Delete ${n.title}`}
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

/* ── Reminders (Fase 13.4) ──────────────────────────────────────────────── */

function RemindersTab() {
  const { t } = useLang();
  const [result, setResult] = useState<{ sent: number; skipped: number; daysAhead: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const send = async (days: number) => {
    setLoading(true);
    try {
      const res = await api.sendReminders(days);
      setResult(res);
      toast.success(
        res.sent === 1
          ? t("admin.remindersSent", { count: res.sent }) + " " + t("admin.reminderEmail_one")
          : t("admin.remindersSent", { count: res.sent }) + " " + t("admin.reminderEmail_other")
      );
    } catch {
      toast.error(t("admin.failedToSendReminders"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-neutral-800 bg-[#1a1a1a]">
      <CardHeader>
        <CardTitle className="text-neutral-50">{t("admin.subscriptionReminders")}</CardTitle>
        <CardDescription className="text-neutral-400">
          {t("admin.subscriptionRemindersDesc")}
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button onClick={() => send(7)} loading={loading}>
            {t("admin.send7dayReminders")}
          </Button>
          <Button onClick={() => send(14)} loading={loading} variant="outline">
            {t("admin.send14dayReminders")}
          </Button>
          <Button onClick={() => send(30)} loading={loading} variant="outline">
            {t("admin.send30dayReminders")}
          </Button>
        </div>
        {result && (
          <div className="text-[13px] text-neutral-400">
            {t("admin.sent")} <span className="text-emerald-400">{result.sent}</span>
            {" | "}
            {t("admin.skippedNoEmail")} <span className="text-neutral-500">{result.skipped}</span>
            {" | "}
            {t("admin.window")} {result.daysAhead} {t("admin.days")}
          </div>
        )}
      </CardPanel>
    </Card>
  );
}

/* ── Migration (Fase 14.4) ────────────────────────────────────────────────── */

function MigrationTab() {
  const { t } = useLang();
  const [running, setRunning] = useState(false);
  const [purgeLegacy, setPurgeLegacy] = useState(false);
  const [report, setReport] = useState<api.MigrationReport | null>(null);

  const run = async (dryRun: boolean) => {
    if (!dryRun) {
      const warning = purgeLegacy
        ? t("admin.confirmPurgeAndMigrate")
        : t("admin.confirmRunRealMigration");
      if (!window.confirm(warning)) return;
    }
    setRunning(true);
    try {
      const result = await api.adminMigrateWorkspaces({
        dry_run: dryRun,
        purge_legacy: !dryRun && purgeLegacy,
      });
      setReport(result);
      toast.success(
        result.dry_run
          ? t("admin.dryRunComplete")
          : t("admin.migrationComplete", { count: result.keys_copied }),
      );
    } catch (err) {
      toast.error(err instanceof api.ApiError ? err.message : t("admin.migrationFailed"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-neutral-800 bg-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-neutral-50">
            {t("admin.workspaceDataMigration")}
          </CardTitle>
          <CardDescription className="text-neutral-400">
            {t("admin.migrationDesc")}
          </CardDescription>
        </CardHeader>
        <CardPanel className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="purge-legacy"
              checked={purgeLegacy}
              onCheckedChange={(v) => setPurgeLegacy(v === true)}
            />
            <Label htmlFor="purge-legacy" className="text-[13px] text-neutral-200">
              {t("admin.purgeLegacyAfterRun")}{" "}
              <span className="text-amber-400/90">{t("admin.finalCutover")}</span>
            </Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => run(true)} loading={running}>
              {t("admin.runDryRun")}
            </Button>
            <Button
              onClick={() => run(false)}
              loading={running}
              className="bg-amber-600 hover:bg-amber-500"
            >
              {t("admin.runRealMigration")}
            </Button>
          </div>
        </CardPanel>
      </Card>

      {report && (
        <Card className="border-neutral-800 bg-[#1a1a1a]">
          <CardHeader>
            <CardTitle className="text-neutral-50">
              {report.dry_run ? t("admin.dryRunReport") : t("admin.migrationReport")}
            </CardTitle>
            <CardDescription className="text-neutral-400">
              {t("admin.legacyKeysFound")} {report.legacy_keys_found.length}
              {report.legacy_purged && ` ${t("admin.legacyKeysPurged")}`}
            </CardDescription>
          </CardHeader>
          <CardPanel className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label={t("admin.usersProcessed")} value={String(report.users_processed)} />
              <StatCard
                label={t("admin.workspacesCreated")}
                value={String(report.workspaces_created)}
                sub={report.dry_run ? t("admin.wouldBeCreated") : undefined}
              />
              <StatCard
                label={t("admin.keysCopied")}
                value={String(report.keys_copied)}
                sub={report.dry_run ? t("admin.wouldBeCopied") : undefined}
              />
              <StatCard label={t("admin.keysSkipped")} value={String(report.keys_skipped)} sub={t("admin.alreadyMigrated")} />
            </div>
            {report.details.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-500">
                      <th className="py-2 pr-4 font-normal">{t("admin.user")}</th>
                      <th className="py-2 pr-4 font-normal">{t("admin.workspace")}</th>
                      <th className="py-2 pr-4 font-normal">{t("admin.copied")}</th>
                      <th className="py-2 font-normal">{t("admin.skipped")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.details.map((d) => (
                      <tr key={d.email} className="border-b border-neutral-800/50 text-neutral-300">
                        <td className="py-2 pr-4">{d.email}</td>
                        <td className="py-2 pr-4 text-neutral-500">
                          {d.workspace_created ? t("admin.newWorkspace") : (d.workspace_id ?? "—").slice(0, 8)}
                        </td>
                        <td className="py-2 pr-4">{d.copied}</td>
                        <td className="py-2">{d.skipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardPanel>
        </Card>
      )}
    </div>
  );
}

/* ── Page shell ───────────────────────────────────────────────────────────── */

export function AdminPage() {
  const { t } = useLang();
  const { isAdmin, loading } = useSubscription();
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
            <Link to="/" aria-label="LokaSync home">
              <span className="text-[14px] font-bold tracking-[0.08em] text-[#fafafa]">
                LOKASYNC
              </span>
            </Link>
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
        <nav className="flex flex-wrap gap-2" aria-label="Founder panel sections">
          {TABS.map(({ id, label, icon: Icon }) => (
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
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-6">
          {tab === "overview" && <OverviewTab />}
          {tab === "vouchers" && <VouchersTab />}
          {tab === "subscribers" && <SubscribersTab />}
          {tab === "maintenance" && <MaintenanceTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "reminders" && <RemindersTab />}
          {tab === "migration" && <MigrationTab />}
        </div>
      </main>
    </div>
  );
}
