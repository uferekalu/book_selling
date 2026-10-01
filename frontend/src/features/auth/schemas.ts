import { z } from "zod";
import { passwordProblem } from "@/lib/password";

const email = z.string().trim().toLowerCase().min(1, "Enter your email address").email("Enter a valid email address");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(120, "Use at most 120 characters"),
    email,
    password: z.string(),
    acceptTerms: z.boolean().refine((v) => v, "Please accept the Terms of Sale and Privacy Policy"),
    marketingOptIn: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const problem = passwordProblem(values.password, { email: values.email, name: values.name });
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
  });
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({ email });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const newPasswordSchema = z
  .object({ password: z.string(), confirm: z.string() })
  .superRefine((values, ctx) => {
    const problem = passwordProblem(values.password);
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
    if (values.confirm !== values.password) {
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "The passwords don't match" });
    }
  });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: z.string(), confirm: z.string() })
  .superRefine((values, ctx) => {
    const problem = passwordProblem(values.newPassword);
    if (problem) ctx.addIssue({ code: "custom", path: ["newPassword"], message: problem });
    else if (values.newPassword === values.currentPassword) {
      ctx.addIssue({ code: "custom", path: ["newPassword"], message: "Choose a password you are not already using" });
    }
    if (values.confirm !== values.newPassword) {
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "The passwords don't match" });
    }
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  preferredCurrency: z.enum(["", "NGN", "USD", "GBP", "EUR"]),
  country: z.string(),
  marketingOptIn: z.boolean(),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const addressSchema = z.object({
  label: z.string().trim().max(40),
  fullName: z.string().trim().min(1, "Enter the recipient's name").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number the courier can call, e.g. +234 801 234 5678"),
  line1: z.string().trim().min(1, "Enter the street address").max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().min(1, "Enter the city or town").max(100),
  state: z.string().trim().max(100),
  postalCode: z.string().trim().max(20),
  country: z.string().length(2, "Choose a country"),
  isDefault: z.boolean(),
});
export type AddressValues = z.infer<typeof addressSchema>;
