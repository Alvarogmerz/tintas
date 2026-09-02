import nodemailer from "nodemailer";
import type { EmailMessage, EmailSendResult, EmailSender } from "./adapter";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export class SmtpEmailSender implements EmailSender {
  private transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor(private config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: msg.to.join(", "),
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
