import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { OTP_LENGTH } from '@vighnaway/contracts';

/** Six digits from the system CSPRNG, zero-padded. */
export const generateOtpCode = (): string => String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');

/** HMAC of email + code under the server secret, so a leaked table cannot be brute-forced offline without it. */
export const hashOtp = (secret: string, email: string, code: string): string =>
  createHmac('sha256', secret).update(`otp:${email}:${code}`).digest('hex');

/** 256 random bits. The prefix only makes tokens recognisable in logs; it carries no meaning. */
export const generateSessionToken = (): string => `vws_${randomBytes(32).toString('base64url')}`;

/** A high-entropy random token needs no slow hash; sha256 is enough to keep raw tokens out of the database. */
export const hashSessionToken = (token: string): string => createHash('sha256').update(`session:${token}`).digest('hex');

export const newId = (): string => randomUUID();
