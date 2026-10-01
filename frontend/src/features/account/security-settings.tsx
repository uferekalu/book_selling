"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Download, Laptop, LogOut, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  FormField,
  Icon,
  Modal,
  OtpInput,
  PasswordInput,
  PasswordStrength,
  Skeleton,
  useToast,
} from "@/components/ui";
import {
  useChangePasswordMutation,
  useLogoutEverywhereMutation,
  useMeQuery,
  useRegenerateRecoveryCodesMutation,
  useRevokeSessionMutation,
  useSessionsQuery,
  useTwoFactorDisableMutation,
  useTwoFactorEnableMutation,
  useTwoFactorSetupMutation,
} from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";
import type { SessionSummary, TwoFactorSetup } from "@/lib/api/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { changePasswordSchema, type ChangePasswordValues } from "@/features/auth/schemas";

export function SecuritySettings() {
  return (
    <>
      <ChangePasswordCard />
      <TwoFactorCard />
      <SessionsCard />
    </>
  );
}

// ---------------------------------------------------------------- password

function ChangePasswordCard() {
  const [change, state] = useChangePasswordMutation();
  const { toast } = useToast();
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const newPassword = useWatch({ control: form.control, name: "newPassword" });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await change({ currentPassword: values.currentPassword, newPassword: values.newPassword }).unwrap();
      form.reset();
      toast({ title: "Password changed", description: "Your other devices have been signed out.", tone: "success" });
    } catch {
      // shown via state.error
    }
  });

  return (
    <Card as="section" aria-labelledby="password-title">
      <CardHeader title={<span id="password-title">Password</span>} description="Changing it signs you out everywhere else." />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <FormField label="Current password" error={errors.currentPassword?.message}>
          <PasswordInput autoComplete="current-password" {...form.register("currentPassword")} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <FormField label="New password" error={errors.newPassword?.message}>
              <PasswordInput autoComplete="new-password" {...form.register("newPassword")} />
            </FormField>
            <PasswordStrength password={newPassword} />
          </div>
          <FormField label="Confirm new password" error={errors.confirm?.message}>
            <PasswordInput autoComplete="new-password" {...form.register("confirm")} />
          </FormField>
        </div>
        <div className="flex justify-end">
          <Button type="submit" isLoading={state.isLoading} loadingLabel="Saving">
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------- two-step verification

function TwoFactorCard() {
  const user = useAppSelector((state) => state.session.user)!;
  useMeQuery(); // keeps twoFactorEnabled fresh after changes
  const [dialog, setDialog] = useState<"enable" | "disable" | "codes" | null>(null);
  const isStaff = user.role === "admin" || user.role === "owner";

  return (
    <Card as="section" aria-labelledby="twofa-title">
      <CardHeader
        title={<span id="twofa-title">Two-step verification</span>}
        description="A code from an authenticator app (Google Authenticator, 1Password, Authy) every time you sign in."
        action={
          <Badge tone={user.twoFactorEnabled ? "success" : isStaff ? "warning" : "neutral"}>
            {user.twoFactorEnabled ? "On" : isStaff ? "Required" : "Off"}
          </Badge>
        }
      />
      {user.twoFactorEnabled ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Your account is protected even if someone learns your password. Keep your recovery codes somewhere safe.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setDialog("codes")}>
              New recovery codes
            </Button>
            {!isStaff && (
              <Button variant="ghost" leadingIcon={<Icon icon={ShieldOff} size="sm" />} onClick={() => setDialog("disable")}>
                Turn off
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {isStaff && (
            <Alert tone="warning" title="Required for staff accounts">
              Store management pages stay locked until two-step verification is on.
            </Alert>
          )}
          <Button className="self-start" leadingIcon={<Icon icon={ShieldCheck} size="sm" />} onClick={() => setDialog("enable")}>
            Turn on two-step verification
          </Button>
        </div>
      )}
      {dialog === "enable" && <EnableTwoFactorDialog onClose={() => setDialog(null)} />}
      {dialog === "disable" && <DisableTwoFactorDialog onClose={() => setDialog(null)} />}
      {dialog === "codes" && <RegenerateCodesDialog onClose={() => setDialog(null)} />}
    </Card>
  );
}

function EnableTwoFactorDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"password" | "scan" | "codes">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setupData, setSetupData] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [setup, setupState] = useTwoFactorSetupMutation();
  const [enable, enableState] = useTwoFactorEnableMutation();

  const confirm = async (value = code) => {
    try {
      const result = await enable({ code: value }).unwrap();
      setCodes(result.recoveryCodes);
      setStep("codes");
    } catch {
      setCode("");
    }
  };

  if (step === "codes") {
    return <RecoveryCodesModal codes={codes} onClose={onClose} title="Two-step verification is on" />;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Turn on two-step verification"
      description={step === "password" ? "Step 1 of 3: confirm it's you." : "Step 2 of 3: link your authenticator app."}
      footer={
        step === "password" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="twofa-password" isLoading={setupState.isLoading} loadingLabel="Checking" disabled={!password}>
              Continue
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} isLoading={enableState.isLoading} loadingLabel="Verifying" disabled={code.length !== 6}>
              Verify code
            </Button>
          </>
        )
      }
    >
      {step === "password" ? (
        <form
          id="twofa-password"
          noValidate
          className="flex flex-col gap-4 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            void setup({ password })
              .unwrap()
              .then((data) => {
                setSetupData(data);
                setStep("scan");
              })
              .catch(() => undefined);
          }}
        >
          {setupState.isError && <Alert tone="danger" title={errorMessage(setupState.error)} />}
          <FormField label="Your password">
            <PasswordInput autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
        </form>
      ) : (
        setupData && (
          <div className="flex flex-col gap-5 pb-2">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-text-muted">
              <li>Open your authenticator app and add a new account.</li>
              <li>Scan this QR code, or type the key below.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {/* Always on white so phones can scan it, in dark mode too. Rendered as an image, never injected HTML. */}
              <span className="rounded-xl bg-paper-0 p-3 shadow-sm ring-1 ring-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI from our API, not an optimisable asset */}
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(setupData.qrCodeSvg)}`}
                  alt="QR code for your authenticator app"
                  width={176}
                  height={176}
                  className="size-44"
                />
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-sm font-medium text-text">Can&rsquo;t scan? Enter this key</p>
                <code className="rounded-md bg-surface-sunken px-3 py-2 font-mono text-sm break-all text-text select-all">
                  {setupData.manualKey}
                </code>
              </div>
            </div>
            {enableState.isError && <Alert tone="danger" title={errorMessage(enableState.error)} />}
            <OtpInput
              label="6-digit code from your app"
              value={code}
              onChange={setCode}
              onComplete={(value) => void confirm(value)}
              invalid={enableState.isError}
              disabled={enableState.isLoading}
            />
          </div>
        )
      )}
    </Modal>
  );
}

function RecoveryCodesModal({ codes, title, onClose }: { codes: string[]; title: string; onClose: () => void }) {
  const { toast } = useToast();
  const text = `Recovery codes (each works once):\n\n${codes.join("\n")}\n`;

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Step 3 of 3: save your recovery codes. They're shown only once."
      footer={<Button onClick={onClose}>I&rsquo;ve saved them</Button>}
    >
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-sm text-text-muted">
          If you lose your phone, each code lets you sign in once. Store them in a password manager or print them.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-surface-sunken p-4 font-mono text-sm text-text sm:grid-cols-2">
          {codes.map((code) => (
            <li key={code} className="tabular-nums">
              {code}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<Icon icon={Copy} size="sm" />}
            onClick={() =>
              void navigator.clipboard
                .writeText(text)
                .then(() => toast({ title: "Codes copied", tone: "success" }))
                .catch(() => toast({ title: "Couldn't copy. Please select and copy them instead.", tone: "warning" }))
            }
          >
            Copy
          </Button>
          <Button variant="outline" size="sm" leadingIcon={<Icon icon={Download} size="sm" />} onClick={download}>
            Download
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RegenerateCodesDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [regenerate, state] = useRegenerateRecoveryCodesMutation();

  if (codes) return <RecoveryCodesModal codes={codes} onClose={onClose} title="New recovery codes" />;

  const submit = (value = code) =>
    void regenerate({ code: value })
      .unwrap()
      .then((r) => setCodes(r.recoveryCodes))
      .catch(() => setCode(""));

  return (
    <Modal
      open
      onClose={onClose}
      title="New recovery codes"
      description="Your old codes stop working once new ones are created."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} isLoading={state.isLoading} disabled={code.length !== 6}>
            Create new codes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <OtpInput label="6-digit code from your app" value={code} onChange={setCode} onComplete={(v) => submit(v)} autoFocus />
      </div>
    </Modal>
  );
}

function DisableTwoFactorDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [disable, state] = useTwoFactorDisableMutation();
  const { toast } = useToast();

  return (
    <Modal
      open
      onClose={onClose}
      title="Turn off two-step verification?"
      description="Your account will be protected by your password alone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it on
          </Button>
          <Button
            variant="danger"
            isLoading={state.isLoading}
            disabled={!password || code.length !== 6}
            onClick={() =>
              void disable({ password, code })
                .unwrap()
                .then(() => {
                  toast({ title: "Two-step verification is off", tone: "info" });
                  onClose();
                })
                .catch(() => setCode(""))
            }
          >
            Turn off
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <FormField label="Your password">
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </FormField>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-text">Code from your authenticator app</p>
          <OtpInput label="6-digit code from your app" value={code} onChange={setCode} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- sessions

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

function SessionsCard() {
  const { data: sessions, isLoading, isError, error } = useSessionsQuery();
  const [revoke, revokeState] = useRevokeSessionMutation();
  const [logoutEverywhere, logoutState] = useLogoutEverywhereMutation();
  const [confirmAll, setConfirmAll] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <Card as="section" aria-labelledby="sessions-title">
      <CardHeader
        title={<span id="sessions-title">Where you&rsquo;re signed in</span>}
        description="Don't recognise a device? Sign it out and change your password."
      />
      {isLoading && <Skeleton className="h-32" />}
      {isError && <Alert tone="danger" title={errorMessage(error)} />}
      {sessions && (
        <ul className="divide-y divide-border">
          {sessions.map((session: SessionSummary) => (
            <li key={session.id} className="flex items-center gap-4 py-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-text-muted">
                <Icon icon={/Android|iPhone|iPad/.test(session.device) ? Smartphone : Laptop} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-text">
                  {session.device}
                  {session.current && <Badge tone="success" size="sm">This device</Badge>}
                </p>
                <p className="truncate text-sm text-text-muted">
                  Active {timeAgo(session.lastActiveAt)} · signed in {timeAgo(session.createdAt)}
                </p>
              </div>
              {!session.current && (
                <Button
                  size="sm"
                  variant="ghost"
                  isLoading={revokeState.isLoading && revokeState.originalArgs === session.id}
                  onClick={() =>
                    void revoke(session.id)
                      .unwrap()
                      .then(() => toast({ title: `Signed out of ${session.device}`, tone: "success" }))
                      .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
                  }
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-border pt-4">
        <Button variant="outline" leadingIcon={<Icon icon={LogOut} size="sm" />} onClick={() => setConfirmAll(true)}>
          Sign out everywhere
        </Button>
      </div>
      <ConfirmDialog
        open={confirmAll}
        title="Sign out on every device?"
        description="Including this one. You'll need your password to sign in again."
        confirmLabel="Sign out everywhere"
        tone="danger"
        isConfirming={logoutState.isLoading}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() =>
          void logoutEverywhere()
            .unwrap()
            .then(() => router.replace("/login"))
            .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
            .finally(() => setConfirmAll(false))
        }
      />
    </Card>
  );
}
