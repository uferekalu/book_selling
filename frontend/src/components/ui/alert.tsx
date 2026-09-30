import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

const tones: Record<"info" | "success" | "warning" | "danger", { icon: LucideIcon; classes: string }> = {
  info: { icon: Info, classes: "border-info/30 bg-info-subtle [&_[data-alert-icon]]:text-info" },
  success: { icon: CheckCircle2, classes: "border-success/30 bg-success-subtle [&_[data-alert-icon]]:text-success" },
  warning: { icon: AlertTriangle, classes: "border-warning/30 bg-warning-subtle [&_[data-alert-icon]]:text-warning" },
  danger: { icon: XCircle, classes: "border-danger/30 bg-danger-subtle [&_[data-alert-icon]]:text-danger" },
};

export interface AlertProps {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Inline message. `danger` and `warning` are announced immediately (role="alert");
 * `info` and `success` politely (role="status").
 */
export function Alert({ tone = "info", title, children, action, onDismiss, className }: AlertProps) {
  const { icon, classes } = tones[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border p-4 text-sm text-text", classes, className)}
    >
      <span data-alert-icon className="mt-0.5">
        <Icon icon={icon} size="md" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-text-muted">{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
      {onDismiss && (
        <IconButton size="sm" label="Dismiss" onClick={onDismiss} icon={<Icon icon={X} size="sm" />} className="-mt-1.5 -mr-1.5" />
      )}
    </div>
  );
}
