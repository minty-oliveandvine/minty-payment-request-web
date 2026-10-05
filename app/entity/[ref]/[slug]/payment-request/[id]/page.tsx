import type { Metadata } from "next";
import { ModuleGate } from "@/components/ModuleGate";
import { PaymentRequestDetailPageClient } from "./PaymentRequestDetailPageClient";

export const metadata: Metadata = {
  title: "Payment Request Details",
  description: "Payment request details",
};

export default function PaymentRequestDetailPage() {
  return (
    <ModuleGate>
      <PaymentRequestDetailPageClient />
    </ModuleGate>
  );
}
