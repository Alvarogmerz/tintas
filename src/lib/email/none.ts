import type { EmailMessage, EmailSendResult, EmailSender } from "./adapter";

/**
 * Adaptador "sin proveedor": no envía nada de verdad, solo loguea. Permite
 * desarrollar y probar el resto de la app sin depender de que IT haya
 * configurado ya el acceso a Office 365.
 */
export class NoneEmailSender implements EmailSender {
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    console.log(`[email:none] Se habría enviado a ${msg.to.join(", ")}: ${msg.subject}`);
    return { success: true };
  }
}
