"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/sessions", label: "Sessions" },
  { href: "/roster", label: "Roster" },
  { href: "/curriculum", label: "Curriculum" },
] as const;

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  // Admin is not part of coaching, so it only appears for the account that
  // can actually use it.
  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin" } as const] : LINKS;

  return (
    <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto">
      {links.map((link) => {
        // "/" would otherwise match every route.
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors
                        duration-200 ${
                          active
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
