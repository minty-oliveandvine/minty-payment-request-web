import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ENTITY_NAME_COOKIE_NAME } from "@/lib/auth";

/**
 * The browser tab names the company, as Flask's pages do ("Opening Balance - <company>"): each
 * page's own title, then " - <company>". The company is the cookie's - `middleware.ts` has already
 * made the address name the same one.
 */
export async function generateMetadata(): Promise<Metadata> {
  const company = (await cookies()).get(ENTITY_NAME_COOKIE_NAME)?.value?.trim();
  if (!company) return {};
  return { title: { template: `%s - ${company}`, default: `Payment Request - ${company}` } };
}

export default function CompanyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
