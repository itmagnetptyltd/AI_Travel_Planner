export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Every email the application sends goes through this interface (ADR-0005). */
export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}
