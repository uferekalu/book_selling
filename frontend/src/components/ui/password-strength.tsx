import { cn } from "@/lib/cn";
import { STRENGTH_LABEL, passwordProblem, passwordStrength } from "@/lib/password";

const BAR_TONE = ["bg-secondary-hover", "bg-danger", "bg-warning", "bg-success", "bg-success"] as const;

export interface PasswordStrengthProps {
  password: string;
  email?: string;
  name?: string;
  id?: string;
  className?: string;
}

/**
 * Four-segment meter plus one actionable tip. Announced politely, so screen-reader users hear the
 * verdict without being interrupted on every keystroke.
 */
export function PasswordStrength({ password, email, name, id, className }: PasswordStrengthProps) {
  const score = passwordStrength(password, { email, name });
  const problem = password ? passwordProblem(password, { email, name }) : null;
  const tip = problem ?? (score > 0 && score < 3 ? "Longer is stronger: try three or four unrelated words" : null);

  return (
    <div id={id} className={cn("flex flex-col gap-1.5", className)} aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-(--duration-base)",
              segment <= score ? BAR_TONE[score] : "bg-secondary-hover",
            )}
          />
        ))}
      </div>
      {password && (
        <p className="text-xs text-text-muted">
          <span className="font-medium text-text">Strength: {STRENGTH_LABEL[score]}.</span> {tip}
        </p>
      )}
    </div>
  );
}
