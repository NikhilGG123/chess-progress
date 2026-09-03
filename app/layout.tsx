import type { Metadata } from "next";
import { Fira_Sans } from "next/font/google";
import "./globals.css";

// Fira Sans across the board. The UI/UX skill paired it with Fira Code for
// headings; a monospace heading font hurts scanning in a data-dense tool, so
// only the sans is used here.
const firaSans = Fira_Sans({
  variable: "--font-fira-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chess Progress",
  description: "Student progress tracking for the chess center.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script below writes the theme class onto <html> before React
    // hydrates, so the DOM React finds has a class its own render does not.
    // suppressHydrationWarning silences that for this element's attributes
    // only -- it does not extend to any child.
    <html
      lang="en"
      className={`${firaSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a remembered theme before the first paint, so a coach who
            chose dark does not get a white flash on every navigation. Has to
            be inline and blocking; a component cannot run this early. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("chess-progress-theme");if(t==="dark"||t==="light"){document.documentElement.classList.add(t)}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-foreground">
        {children}
      </body>
    </html>
  );
}
