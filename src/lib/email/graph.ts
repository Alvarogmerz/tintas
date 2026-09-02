import type { EmailMessage, EmailSendResult, EmailSender } from "./adapter";

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderUpn: string; // buzón que envía, p.ej. tecnologia@pgoucam.com
}

/**
 * Envío vía Microsoft Graph (flujo client-credentials). Requiere que un admin
 * del tenant de Office 365 registre una app en Entra ID con el permiso de
 * aplicación "Mail.Send" y dé consentimiento — hasta entonces esta clase
 * fallará con un error claro, sin tumbar el resto de la app (ver adaptador
 * "none" para desarrollo mientras tanto).
 */
export class GraphEmailSender implements EmailSender {
  constructor(private config: GraphConfig) {}

  private async getAccessToken(): Promise<string> {
    const url = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(`No se pudo obtener token de Microsoft Graph (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    try {
      const token = await this.getAccessToken();
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.senderUpn)}/sendMail`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: msg.subject,
            body: { contentType: "HTML", content: msg.html },
            toRecipients: msg.to.map((address) => ({ emailAddress: { address } })),
          },
          saveToSentItems: true,
        }),
      });
      if (!res.ok) {
        return { success: false, error: `Graph sendMail falló (${res.status}): ${await res.text()}` };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
