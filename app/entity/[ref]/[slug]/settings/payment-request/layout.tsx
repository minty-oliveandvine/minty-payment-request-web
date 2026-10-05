import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Request Settings",
  description: "Settings",
};

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
