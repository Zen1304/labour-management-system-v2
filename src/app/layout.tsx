import type { Metadata } from "next";
import "./globals.css";

// Not using next/font/google here: this build sandbox's network can't
// reach fonts.googleapis.com. System font stack instead — revisit once
// deployed somewhere with normal internet access, or self-host via
// next/font/local if a specific brand font is wanted later.

export const metadata: Metadata = {
  title: "Labour Management System",
  description: "Labour Management & Attendance Workflow — BilaraGroup",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
