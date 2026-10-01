"use client";

import { LayoutDashboard, LogOut, ShieldCheck, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, Button, ButtonLink, DropdownMenu, Icon, Skeleton, useToast } from "@/components/ui";
import { useLogoutMutation } from "@/lib/api/auth-api";
import { useAppSelector } from "@/lib/redux/hooks";

/** Header account control: sign-in links, or the signed-in person's menu. */
export function AccountMenu() {
  const { status, user } = useAppSelector((state) => state.session);
  const [logout] = useLogoutMutation();
  const router = useRouter();
  const { toast } = useToast();

  if (status === "checking") return <Skeleton className="h-11 w-24 rounded-full" />;

  if (status !== "authenticated" || !user) {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink href="/login" variant="ghost" size="sm">
          Sign in
        </ButtonLink>
        <ButtonLink href="/register" variant="primary" size="sm">
          Create account
        </ButtonLink>
      </div>
    );
  }

  return (
    <DropdownMenu
      label="Your account"
      items={[
        { label: "Your account", icon: User, onSelect: () => router.push("/account") },
        { label: "Security", icon: ShieldCheck, onSelect: () => router.push("/account/security") },
        ...(user.role === "admin" || user.role === "owner"
          ? [{ label: "Store admin", icon: LayoutDashboard, onSelect: () => router.push("/admin") }]
          : []),
        {
          label: "Sign out",
          icon: LogOut,
          tone: "danger",
          onSelect: () => {
            void logout().then(() => {
              toast({ title: "You've been signed out", tone: "info" });
              router.push("/");
            });
          },
        },
      ]}
      trigger={(props) => (
        <Button variant="ghost" size="sm" className="gap-2 pr-3 pl-1.5" {...props}>
          <Avatar name={user.name} size="sm" className="size-8" />
          <span className="max-w-32 truncate">{user.name.split(/\s+/)[0]}</span>
          <span className="sr-only">: open account menu</span>
        </Button>
      )}
    />
  );
}

/** Mobile drawer version: plain links, no portal-based menu inside the drawer (frontend/CLAUDE.md). */
export function AccountLinks({ onNavigate }: { onNavigate: () => void }) {
  const { status, user } = useAppSelector((state) => state.session);
  const [logout] = useLogoutMutation();
  const router = useRouter();

  if (status === "checking") return <Skeleton className="h-11 w-full" />;
  if (status !== "authenticated" || !user) {
    return (
      <div className="flex flex-col gap-2">
        <ButtonLink href="/login" variant="outline" fullWidth onClick={onNavigate}>
          Sign in
        </ButtonLink>
        <ButtonLink href="/register" fullWidth onClick={onNavigate}>
          Create account
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} />
        <div className="min-w-0">
          <p className="truncate font-medium text-text">{user.name}</p>
          <p className="truncate text-sm text-text-muted">{user.email}</p>
        </div>
      </div>
      <Button
        variant="outline"
        fullWidth
        leadingIcon={<Icon icon={LogOut} size="sm" />}
        onClick={() => {
          onNavigate();
          void logout().then(() => router.push("/"));
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
