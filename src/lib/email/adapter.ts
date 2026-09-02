export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSendResult {
  success: boolean;
  error?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<EmailSendResult>;
}
