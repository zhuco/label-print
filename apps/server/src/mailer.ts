import nodemailer from "nodemailer";
import type { PasswordResetMailer } from "./app.js";

export type SmtpPasswordResetMailerOptions = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

/** Uses any SMTP provider (Resend SMTP, Amazon SES, Mailgun, Tencent/Alibaba mail, etc.). */
export function createSmtpPasswordResetMailer(options: SmtpPasswordResetMailerOptions): PasswordResetMailer {
  const transporter = nodemailer.createTransport({
    host: options.host, port: options.port, secure: options.secure,
    auth: options.user && options.password ? { user: options.user, pass: options.password } : undefined,
  });
  return async ({ user, token }) => {
    await transporter.sendMail({
      from: options.from,
      to: user.email,
      subject: "标签打印软件：重置个人云空间密码",
      text: `你正在重置个人云空间密码。请在桌面端“登录 / 注册”窗口中选择“忘记密码”，粘贴以下一次性重置码：\n\n${token}\n\n该重置码 15 分钟后失效。若不是你本人操作，请忽略此邮件。`,
    });
  };
}

export function passwordResetMailerFromEnvironment(environment = process.env): PasswordResetMailer | undefined {
  const host = environment.SMTP_HOST;
  if (!host) return undefined;
  const user = environment.SMTP_USER;
  const password = environment.SMTP_PASSWORD;
  const from = environment.SMTP_FROM;
  if (!from) throw new Error("SMTP_HOST requires SMTP_FROM.");
  if (Boolean(user) !== Boolean(password)) throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together.");
  const port = Number(environment.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be a valid TCP port.");
  return createSmtpPasswordResetMailer({ host, user, password, from, port, secure: environment.SMTP_SECURE === "true" });
}
