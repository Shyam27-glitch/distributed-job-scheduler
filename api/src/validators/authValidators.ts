import { z } from 'zod';

export const registerSchema = z.object({
  organizationName: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
