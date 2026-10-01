"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";

/** Sign-in and sign-up pages send an already signed-in visitor straight on. */
export function useRedirectWhenSignedIn(destination: string) {
  const status = useAppSelector((state) => state.session.status);
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, destination, router]);
  return status;
}
