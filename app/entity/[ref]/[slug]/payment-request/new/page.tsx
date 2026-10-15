import type { Metadata } from "next";
import { ModuleGate } from "@/components/ModuleGate";
import { NewPaymentRequestPageClient } from "./NewPaymentRequestPageClient";

export const metadata: Metadata = {
  title: "New payment request",
  description: "Add a payment request",
};

/**
 * Add payment request (Part 15.16). A static segment, so it wins over `[id]`: `new` is never
 * looked up as a Payment No.
 */
export default function NewPaymentRequestPage() {
  return (
    <ModuleGate>
      <NewPaymentRequestPageClient />
    </ModuleGate>
  );
}
