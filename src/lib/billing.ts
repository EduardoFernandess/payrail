export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED";
export type InvoiceStatus = "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE";

export function nextPeriodEnd(from: Date, intervalDays: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + intervalDays);
  return d;
}

export function applyPaymentResult(input: {
  subscriptionStatus: SubscriptionStatus;
  invoiceStatus: InvoiceStatus;
  failedPaymentCount: number;
  success: boolean;
  maxFailures?: number;
}): {
  subscriptionStatus: SubscriptionStatus;
  invoiceStatus: InvoiceStatus;
  failedPaymentCount: number;
} {
  const maxFailures = input.maxFailures ?? 3;
  if (input.subscriptionStatus === "CANCELED") {
    return {
      subscriptionStatus: "CANCELED",
      invoiceStatus: input.invoiceStatus,
      failedPaymentCount: input.failedPaymentCount,
    };
  }

  if (input.success) {
    return {
      subscriptionStatus: "ACTIVE",
      invoiceStatus: "PAID",
      failedPaymentCount: 0,
    };
  }

  const failedPaymentCount = input.failedPaymentCount + 1;
  if (failedPaymentCount >= maxFailures) {
    return {
      subscriptionStatus: "CANCELED",
      invoiceStatus: "UNCOLLECTIBLE",
      failedPaymentCount,
    };
  }

  return {
    subscriptionStatus: "PAST_DUE",
    invoiceStatus: "OPEN",
    failedPaymentCount,
  };
}

export function prorateAmount(amountCents: number, usedDays: number, intervalDays: number): number {
  if (intervalDays <= 0) return amountCents;
  const ratio = Math.min(1, Math.max(0, usedDays / intervalDays));
  return Math.round(amountCents * ratio);
}
