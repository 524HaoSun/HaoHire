import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HaoHire",
  applicationName: "HaoHire",
  description: "Import a job, track its progress, and never miss a deadline.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HaoHire", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-snoopy-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-snoopy-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon-snoopy.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f04412",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
