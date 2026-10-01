import type { Metadata } from "next";
import { SetPasswordForm } from "@/features/auth/set-password-form";

export const metadata: Metadata = { title: "Set up your account" };

export default async function ClaimAccountPage({ searchParams }: PageProps<"/claim-account">) {
  const { token } = await searchParams;
  return <SetPasswordForm purpose="claim-account" token={typeof token === "string" ? token : null} />;
}
