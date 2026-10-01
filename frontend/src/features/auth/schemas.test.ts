import { describe, expect, it } from "vitest";
import { addressSchema, changePasswordSchema, newPasswordSchema, registerSchema } from "./schemas";

describe("auth form schemas", () => {
  it("normalises email and requires terms on registration", () => {
    const ok = registerSchema.safeParse({
      name: "Ada Okafor",
      email: "  Ada@Example.COM ",
      password: "lathe-gearbox-torque-42",
      acceptTerms: true,
      marketingOptIn: false,
    });
    expect(ok.success && ok.data.email).toBe("ada@example.com");

    const noTerms = registerSchema.safeParse({ ...ok.data, acceptTerms: false });
    expect(noTerms.success).toBe(false);
  });

  it("applies the password policy with the person's own name and email", () => {
    const result = registerSchema.safeParse({
      name: "Ada Okafor",
      email: "ada@example.com",
      password: "okafor-likes-gears",
      acceptTerms: true,
      marketingOptIn: false,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["password"], message: expect.stringMatching(/name/) });
  });

  it("checks the confirmation matches", () => {
    const result = newPasswordSchema.safeParse({ password: "lathe-gearbox-torque-42", confirm: "lathe-gearbox-torque-43" });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(["confirm"]);
  });

  it("refuses reusing the current password", () => {
    const same = "lathe-gearbox-torque-42";
    const result = changePasswordSchema.safeParse({ currentPassword: same, newPassword: same, confirm: same });
    expect(result.error?.issues[0].message).toMatch(/not already using/);
  });

  it("validates a delivery address", () => {
    const base = {
      label: "",
      fullName: "Ada Okafor",
      phone: "+234 801 234 5678",
      line1: "12 Campus Road",
      line2: "",
      city: "Lagos",
      state: "Lagos",
      postalCode: "",
      country: "NG",
      isDefault: true,
    };
    expect(addressSchema.safeParse(base).success).toBe(true);
    expect(addressSchema.safeParse({ ...base, phone: "call me" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, country: "" }).success).toBe(false);
  });
});
