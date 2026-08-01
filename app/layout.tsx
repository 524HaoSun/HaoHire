import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HaoHire - Job application tracking",
  description: "Import a job, track its progress, and never miss a deadline.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
