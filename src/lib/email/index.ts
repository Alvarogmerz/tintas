import type { PrismaClient } from "@prisma/client";
import type { EmailSender } from "./adapter";
import { NoneEmailSender } from "./none";
import { SmtpEmailSender } from "./smtp";
import { GraphEmailSender } from "./graph";
import { getSetting } from "../settings";

export type { EmailMessage, EmailSendResult, EmailSender } from "./adapter";

export async function getEmailSender(prisma: PrismaClient): Promise<EmailSender> {
  const provider = await getSetting(prisma, "emailProvider");

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST;
    if (!host) return new NoneEmailSender();
    return new SmtpEmailSender({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM ?? "Tintas Auto <tintas-auto@pgoucam.com>",
    });
  }

  if (provider === "graph") {
    const tenantId = process.env.GRAPH_TENANT_ID;
    const clientId = process.env.GRAPH_CLIENT_ID;
    const clientSecret = process.env.GRAPH_CLIENT_SECRET;
    const senderUpn = process.env.GRAPH_SENDER_UPN;
    if (!tenantId || !clientId || !clientSecret || !senderUpn) return new NoneEmailSender();
    return new GraphEmailSender({ tenantId, clientId, clientSecret, senderUpn });
  }

  return new NoneEmailSender();
}
