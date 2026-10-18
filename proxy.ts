import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/proxy";

// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`, and the
// exported function from `middleware` to `proxy`. Supabase's published auth
// guides still show the old names -- following them here would produce a file
// Next never calls, silently leaving every route unprotected.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, image files, and the two files crawlers
    // fetch before anything else.
    //
    // robots.txt has to be exempt or the gate redirects it to /login, and a
    // robots.txt that answers with an HTML page is treated as absent -- which
    // means "crawl everything", the exact opposite of what app/robots.ts says.
    // Found by asking for it: HTTP 307, location /login.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
