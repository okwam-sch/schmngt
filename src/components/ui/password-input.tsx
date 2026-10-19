import * as React from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { checkPassword, passwordStrength } from "@/lib/password-policy";

type Props = Omit<React.ComponentProps<"input">, "type">;

/** Password input with a Show/Hide toggle. */
export function PasswordInput({ className, ...props }: Props) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn("pr-16", className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex items-center gap-1 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

const barColor = ["bg-muted", "bg-destructive", "bg-chart-4", "bg-chart-2", "bg-primary"];

/** Live strength meter + checklist of the five policy requirements. */
export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const rules = checkPassword(password);
  const { score, label } = passwordStrength(password);
  return (
    <div id={id} className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= score ? barColor[score] : "bg-muted")}
            />
          ))}
        </div>
        <span className="w-12 text-right text-xs font-medium text-muted-foreground">
          {label || "\u00a0"}
        </span>
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {rules.map((r) => (
          <li
            key={r.id}
            className={cn("flex items-center gap-1.5", r.met ? "text-foreground" : "text-muted-foreground")}
          >
            {r.met ? (
              <Check className="size-3.5 text-primary" aria-hidden />
            ) : (
              <X className="size-3.5" aria-hidden />
            )}
            <span>
              {r.label}
              <span className="sr-only">{r.met ? " (met)" : " (not met)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
