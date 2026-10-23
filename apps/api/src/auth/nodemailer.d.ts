/** The few nodemailer calls we use; the package ships no types. */
declare module 'nodemailer' {
  export interface SendMailOptions {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }
  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<unknown>;
  }
  export function createTransport(url: string): Transporter;
}
