"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Container, Skeleton } from "@/components/ui";
import { useAppSelector } from "@/lib/redux/hooks";

/**
 * Client-side gate for signed-in pages. The API enforces access regardless (every endpoint is
 * default-deny); this only decides what to render, and sends anonymous visitors to sign in with a
 * `next` link back here.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAppSelector((state) => state.session.status);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== "authenticated") {
    return (
      <Container className="flex flex-col gap-6 py-12" aria-busy="true">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-11 w-full max-w-lg" />
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  }
  return <>{children}</>;
}
