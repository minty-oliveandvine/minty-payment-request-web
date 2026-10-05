import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Settings",
  description: "Settings",
};

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
