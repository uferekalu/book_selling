import { describe, expect, it } from "vitest";
import { passwordProblem, passwordStrength } from "./password";

describe("password policy mirror", () => {
  it("matches the backend rules", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("password123")).toMatch(/too common/);
    expect(passwordProblem("zzzzzzzzzzzz")).toMatch(/repeated/);
    expect(passwordProblem("adaokafor-2026!", { email: "adaokafor@example.com" })).toMatch(/email/);
    expect(passwordProblem("i-am-okafor-now", { name: "Ada Okafor" })).toMatch(/name/);
    expect(passwordProblem("lathe-gearbox-torque-42")).toBeNull();
  });

  it("scores strength without ever calling a rejected password strong", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(1);
    expect(passwordStrength("password123")).toBe(1);
    expect(passwordStrength("lathe-gearbox")).toBeGreaterThanOrEqual(2);
    expect(passwordStrength("Lathe-Gearbox-Torque-42")).toBe(4);
    expect(passwordStrength("aaaaaaaaaaaaaaaaaaaaaaab")).toBe(1);
  });
});
