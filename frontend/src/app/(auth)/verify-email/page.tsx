import type { Metadata } from "next";
import { VerifyEmailStatus } from "@/features/auth/verify-email-status";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  return <VerifyEmailStatus token={typeof token === "string" ? token : null} />;
}
