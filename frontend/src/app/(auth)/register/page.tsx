import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/register-form";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Create your account" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { next } = await searchParams;
  return <RegisterForm next={safeNextPath(typeof next === "string" ? next : null)} />;
}
