/** The few nodemailer calls we use; the package ships no types. */
declare module 'nodemailer' {
  export interface SendMailOptions {
    from: string;
    to: string;
    subject: string;
    text: string;
  }
  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<unknown>;
    close(): void;
  }
  export interface TransportOptions {
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
  }
  export interface SmtpConfig extends TransportOptions {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }
  export function createTransport(config: string | SmtpConfig, defaults?: TransportOptions): Transporter;
}
