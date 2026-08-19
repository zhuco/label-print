import { describe, expect, it } from "vitest";
import { passwordResetMailerFromEnvironment } from "../mailer.js";

describe("passwordResetMailerFromEnvironment", () => {
  it("supports unauthenticated local SMTP sandboxes while rejecting partial credentials", () => {
    expect(passwordResetMailerFromEnvironment({ SMTP_HOST: "mailpit", SMTP_FROM: "no-reply@example.test" })).toBeTypeOf("function");
    expect(() => passwordResetMailerFromEnvironment({ SMTP_HOST: "smtp.example.test", SMTP_FROM: "no-reply@example.test", SMTP_USER: "user" })).toThrow("SMTP_USER and SMTP_PASSWORD");
  });
});
