"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { buttonClass } from "@/components/ui/button";

const initialState: LoginState = { error: null };

// Set only on the public demo deployment. A visitor should not have to guess
// a password, and the real deployment must never show one.
const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** The one page reachable signed out. proxy.ts sends everything else here. */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Chess Progress
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Coach sign-in</p>

          {DEMO && (
            <div className="mt-4 rounded-md border border-border bg-surface-raised p-3">
              <p className="text-sm font-medium">Demonstration</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every student here is invented. Sign in with{" "}
                <span className="font-mono text-xs">brad@example.com</span> and{" "}
                <span className="font-mono text-xs">ChessCoach2026!</span> — or{" "}
                <span className="font-mono text-xs">admin@example.com</span> for
                the account that can delete things.
              </p>
            </div>
          )}
        </div>

        <form
          action={formAction}
          className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm"
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base
                           placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
              />
            </div>

            {/* Error sits next to the fields, not stranded at the top, and is
                announced to screen readers when it appears. */}
            {state.error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className={buttonClass("primary", "lg")}
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Accounts are created by the administrator. There is no public sign-up.
        </p>
      </div>
    </main>
  );
}
