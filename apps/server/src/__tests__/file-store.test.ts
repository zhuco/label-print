import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore } from "../file-store.js";

describe("FileStore", () => {
  it("preserves a development account, membership, and label across a restart", () => {
    const filePath = join(mkdtempSync(join(tmpdir(), "label-cloud-")), "cloud-store.json");
    const first = new FileStore(filePath);
    const user = first.createDevelopmentUser("3776878@qq.com", "123456", "Local test user");
    first.setPlanFromSubscription(user.id, "pro", "2027-08-05T15:59:59.000Z");
    const label = first.createLabel(user.id, "Persisted", validContent());
    const billingEvent = {
      provider: "test-adapter", eventId: "persisted-event", type: "subscription_renewed" as const,
      userId: user.id, plan: "pro" as const, planExpiresAt: "2027-08-05T15:59:59.000Z", occurredAt: new Date(Date.now() + 1_000).toISOString(),
    };
    expect(first.applyBillingWebhookEvent(billingEvent).status).toBe("applied");

    const restarted = new FileStore(filePath);
    const signedIn = restarted.getUserForLogin("3776878@qq.com");
    expect(signedIn?.plan).toBe("pro");
    expect(signedIn?.planExpiresAt).toBe("2027-08-05T15:59:59.000Z");
    expect(restarted.getLabel(user.id, label.id).name).toBe("Persisted");
    expect(restarted.applyBillingWebhookEvent(billingEvent).status).toBe("duplicate");
  });
});

function validContent() {
  return {
    format: "label-print-cloud-document", version: 1, unit: "mm",
    canvas: { widthMm: 50, heightMm: 30 },
    elements: [],
  };
}
