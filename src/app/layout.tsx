import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// Shared suite chrome. Relative rather than the @erp-ui alias: tsconfig paths
// are resolved for module imports, not guaranteed for the CSS pipeline.
import "../vendor/erp-ui/erp-ui.css";
import { StaleBuildReloader } from "@erp-ui";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ERP - Project Manager",
  description: "erp.io Project Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${geistSans.variable} ${geistMono.variable}`}>
      <body className="h-full">
        {/* Outside the route groups so a tab left open across a deploy recovers
            on every page, including /sign-in. */}
        <StaleBuildReloader />
        {children}
      </body>
    </html>
  );
}
