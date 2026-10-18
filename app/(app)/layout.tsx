import Link from "next/link";
import { Nav } from "@/components/layout/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { currentCoach } from "@/lib/queries";
import { logout } from "../login/actions";

// Shell for every signed-in page. /login sits outside this route group, so it
// gets no navigation and no coach lookup.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, coach, isAdmin, error } = await currentCoach();

  return (
    <>
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Chess Progress
          </Link>

          <Nav isAdmin={isAdmin} />

          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
            <span
              className="rounded bg-status-needs-testing px-2 py-0.5 text-xs font-medium
                         text-status-needs-testing-fg"
              title="Every student in this deployment is invented."
            >
              Demo data
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {coach?.display_name ?? user?.email}
            </span>
            <ThemeToggle />
            <form action={logout}>
              {/* Ghost: signing out is not something a coach came here to
                  do, and a bordered button beside the navigation reads as a
                  fifth destination. */}
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* A signed-in user with no coaches row can read nothing: every policy
          is gated on is_coach(). Say so plainly instead of rendering a page
          full of empty tables -- but only when that is really the problem. */}
      {user && error ? (
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
          <div className="rounded-lg border border-border bg-surface-raised p-6">
            <h1 className="text-lg font-semibold">
              Could not load your account
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Signed in as {user.email}, but the coach lookup failed. This is a
              database problem, not a problem with your account — reload, and if
              it persists, send this on:
            </p>
            <p className="mt-3 rounded bg-muted px-3 py-2 font-mono text-xs">
              {error}
            </p>
          </div>
        </main>
      ) : user && !coach ? (
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
          <div className="rounded-lg border border-border bg-surface-raised p-6">
            <h1 className="text-lg font-semibold">
              This account is not a coach
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You are signed in as {user.email}, but there is no coach record
              for this account, so no student data can be loaded. Ask the
              administrator to add one.
            </p>
          </div>
        </main>
      ) : (
        children
      )}
    </>
  );
}
