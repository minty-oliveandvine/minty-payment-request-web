import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { SidebarProvider } from "@/components/ui/Sidebar";
import { ProfilePanel } from "@/features/profile";
import { SubscriptionsOverviewCard } from "@/features/subscription";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Payment Request",
  description: "Payment Request",
  // A shared link's preview card: the image is app/opengraph-image.png (and twitter-image.png).
  openGraph: { siteName: "Minty", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="m-0 min-w-0 overflow-x-clip antialiased">
        <ToastProvider>
          {/* The sidebar - menu + My Profile, copied from minty-web (components/ui/Sidebar.tsx):
              the one place the profile and subscription features meet, as in minty-web's
              app/layout.tsx. */}
          <SidebarProvider profile={<ProfilePanel subscriptions={<SubscriptionsOverviewCard />} />}>
            <div id="app-scroll-root" className="min-h-dvh min-h-screen w-full min-w-0 max-w-full">
              {children}
            </div>
          </SidebarProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
