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
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
