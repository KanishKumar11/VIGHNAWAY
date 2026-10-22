import { z } from 'zod';

/**
 * Accounts (email one-time code). Signing in is optional for citizens and required for operators
 * and admins. An account never feeds routing: incidents stay the only state that drives it, and
 * only an operator action sets Verified.
 */
export const ROLES = ['citizen', 'operator', 'admin'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** The surface a person signs in on. The server enforces ROLE_CLIENTS; the client only declares it. */
export const CLIENTS = ['web', 'mobile'] as const;
export const ClientSchema = z.enum(CLIENTS);
export type Client = z.infer<typeof ClientSchema>;

/** Who may sign in where. Citizens use the phone and the public web page; staff use the web console. */
export const ROLE_CLIENTS: Record<Role, readonly Client[]> = {
  citizen: ['mobile', 'web'],
  operator: ['web'],
  admin: ['web'],
};

export const canSignInOn = (role: Role, client: Client): boolean => ROLE_CLIENTS[role].includes(client);

/** Roles that may run operator actions (verify, resolve, dismiss, simulation, audience clear). */
export const isStaffRole = (role: Role): boolean => role === 'operator' || role === 'admin';

export const OTP_LENGTH = 6;
export const DISPLAY_NAME_MAX = 60;

export const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const OtpCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const OtpRequestBodySchema = z.object({ email: EmailSchema, client: ClientSchema }).strict();
export type OtpRequestBody = z.infer<typeof OtpRequestBodySchema>;

/** Always the same shape, whether or not the email has an account. */
export const OtpRequestResponseSchema = z.object({
  sent: z.literal(true),
  expiresInS: z.number().int().positive(),
  resendAfterS: z.number().int().min(0),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

export const OtpVerifyBodySchema = z
  .object({
    email: EmailSchema,
    code: OtpCodeSchema,
    client: ClientSchema,
    /** Used only when this sign-in creates the account. */
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX).optional(),
  })
  .strict();
export type OtpVerifyBody = z.infer<typeof OtpVerifyBodySchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: RoleSchema,
  displayName: z.string().nullable(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthSessionResponseSchema = z.object({
  /** Opaque bearer token. Shown once; the server keeps only a hash. */
  token: z.string(),
  /** ISO 8601 UTC. */
  expiresAt: z.string(),
  user: AuthUserSchema,
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const MeResponseSchema = z.object({ user: AuthUserSchema, client: ClientSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * GET /me/stats: a thank-you for the signed-in reporter. Counts only; it is never a score that
 * routing, corroboration or an incident's status reads.
 */
export const MyStatsResponseSchema = z.object({
  reports: z.number().int().min(0),
  /** Reports on incidents an operator later verified. */
  inVerifiedIncidents: z.number().int().min(0),
});
export type MyStatsResponse = z.infer<typeof MyStatsResponseSchema>;

export const AdminUserSchema = AuthUserSchema.extend({
  disabled: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUsersResponseSchema = z.object({ users: z.array(AdminUserSchema) });
export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;

/** POST /admin/users: gives an email a role before its first sign-in. */
export const AdminCreateUserBodySchema = z.object({ email: EmailSchema, role: RoleSchema }).strict();
export type AdminCreateUserBody = z.infer<typeof AdminCreateUserBodySchema>;

/** POST /admin/users/:id: change the role, disable or re-enable an account. */
export const AdminUpdateUserBodySchema = z
  .object({ role: RoleSchema.optional(), disabled: z.boolean().optional() })
  .strict()
  .refine((b) => b.role !== undefined || b.disabled !== undefined, 'Nothing to change');
export type AdminUpdateUserBody = z.infer<typeof AdminUpdateUserBodySchema>;

export const AdminUserResponseSchema = z.object({ user: AdminUserSchema });
export type AdminUserResponse = z.infer<typeof AdminUserResponseSchema>;
