import { describe, expect, it } from "vitest";
import { applyPaymentResult, nextPeriodEnd, prorateAmount } from "../src/lib/billing";

describe("billing state machine", () => {
  it("marks paid and resets failures on success", () => {
    expect(
      applyPaymentResult({
        subscriptionStatus: "PAST_DUE",
        invoiceStatus: "OPEN",
        failedPaymentCount: 2,
        success: true,
      }),
    ).toEqual({ subscriptionStatus: "ACTIVE", invoiceStatus: "PAID", failedPaymentCount: 0 });
  });

  it("moves to past_due then cancels after max failures", () => {
    const once = applyPaymentResult({
      subscriptionStatus: "ACTIVE",
      invoiceStatus: "OPEN",
      failedPaymentCount: 0,
      success: false,
    });
    expect(once.subscriptionStatus).toBe("PAST_DUE");
    const final = applyPaymentResult({ ...once, success: false, maxFailures: 3 });
    const third = applyPaymentResult({ ...final, success: false, maxFailures: 3 });
    expect(third.subscriptionStatus).toBe("CANCELED");
    expect(third.invoiceStatus).toBe("UNCOLLECTIBLE");
  });

  it("advances period and prorates", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(nextPeriodEnd(from, 30).toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(prorateAmount(3000, 15, 30)).toBe(1500);
  });
});
