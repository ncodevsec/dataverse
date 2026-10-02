import { z } from 'zod';

// ---------- primitives ----------
/** Trims strings; '' becomes null; undefined stays undefined (so PATCH can omit fields). */
const clean = (v) => (v === undefined ? undefined : v === null ? null : typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v);
export const optText = (max = 255) => z.preprocess(clean, z.string().max(max).nullable().optional());
export const optEnum = (values) => z.preprocess(clean, z.enum(values).nullable().optional());
export const optId = z.preprocess(
  (v) => (v === '' || v === 0 || v === '0' ? null : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v),
  z.number().int().positive().max(2_147_483_647).nullable().optional(),
);
export const pageParams = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const idParam = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });
export const uuidParam = z.object({ id: z.string().uuid() });

const emailField = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const usernameField = z.string().trim().regex(/^[A-Za-z0-9_.-]{3,32}$/, 'Use 3-32 letters, numbers, dots, dashes or underscores');
export const passwordField = z
  .string()
  .min(10, 'Use at least 10 characters')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password is too long (max 72 bytes)');

// ---------- auth ----------
export const registerSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter your name').max(80),
  username: usernameField,
  email: emailField,
  password: passwordField,
}).strict();

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
}).strict();

export const forgotSchema = z.object({ email: emailField }).strict();
export const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordField }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordField }).strict();

const THEMES = ['light', 'dark', 'system'];
export const accountUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  username: usernameField.optional(),
  email: emailField.optional(),
  theme: z.enum(THEMES).optional(),
  preferences: z.object({
    pageSize: z.number().int().refine((n) => [10, 20, 50, 100].includes(n), 'Invalid page size').optional(),
    dateFormat: z.enum(['dmy', 'mdy', 'iso']).optional(),
  }).strict().optional(),
}).strict();

// ---------- admin: users ----------
export const adminUserCreateSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  username: usernameField,
  email: emailField,
  password: passwordField.optional(), // generated when omitted
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  profileId: optId,
  mustChangePassword: z.boolean().default(true),
}).strict();

export const adminUserUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  username: usernameField.optional(),
  email: emailField.optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  profileId: optId,
}).strict();

export const adminResetPasswordSchema = z.object({ password: passwordField.optional() }).strict();

export const userListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  ...pageParams,
});

// ---------- profiles ----------
const dateField = z.preprocess(
  clean,
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
    .refine((s) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s); }, 'Not a valid date')
    .refine((s) => s >= '1800-01-01', 'Date is too far in the past')
    .refine((s) => s <= new Date().toISOString().slice(0, 10), 'Date cannot be in the future')
    .nullable().optional(),
);

const tagsField = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',') : v),
  z.array(z.string().trim().min(1).max(40)).max(30).optional().transform((a) => (a ? [...new Set(a)] : a)),
);

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const profileShape = {
  name: z.string().trim().min(1, 'Name is required').max(255),
  nickname: optText(255),
  email: z.preprocess(clean, z.string().email('Enter a valid email address').max(254).nullable().optional()),
  phone: optText(32),
  gender: optEnum(['MALE', 'FEMALE']),
  maritalStatus: optEnum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']),
  dob: dateField,
  bloodGroup: optEnum(BLOOD_GROUPS),
  religion: optText(120),
  politicalView: optText(255),
  nid: optText(64),
  occupation: optText(255),
  educationLevel: optText(127),
  educationGroup: optText(127),
  lineage: optText(255),
  presentStreet: optText(255),
  presentCity: optText(127),
  street: optText(255),
  unionName: optText(127),
  subDistrict: optText(127),
  district: optText(127),
  state: optText(127),
  zip: optText(16),
  country: optText(127),
  facebook: optText(255),
  instagram: optText(255),
  tiktok: optText(255),
  about: optText(10_000),
  tags: tagsField,
  fatherId: optId,
  motherId: optId,
  spouseId: optId,
};

export const profileCreateSchema = z.object(profileShape).strict();
export const profileUpdateSchema = z.object(profileShape).partial().strict();

export const profileListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  district: z.string().trim().max(127).optional(),
  tag: z.string().trim().max(40).optional(),
  sort: z.enum(['name', 'newest', 'oldest', 'id']).default('name'),
  ...pageParams,
});

export const optionsQuery = z.object({ q: z.string().trim().max(100).default(''), limit: z.coerce.number().int().min(1).max(20).default(8) });

export const postSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  content: z.string().max(20_000).default(''),
  status: z.enum(['published', 'draft', 'archived']).default('published'),
  tags: tagsField,
}).strict();
export const postUpdateSchema = postSchema.partial().strict();

// ---------- tree ----------
export const treeQuery = z.object({
  up: z.coerce.number().int().min(0).max(6).default(3),
  down: z.coerce.number().int().min(0).max(5).default(2),
});

// ---------- caller id ----------
export const contactShape = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  number: z.string().trim().min(1, 'Number is required').max(64),
  connectionId: optId, // whose phonebook it came from
  profileId: optId,    // who the number belongs to
};
export const contactCreateSchema = z.object(contactShape).strict();
export const contactUpdateSchema = z.object(contactShape).partial().strict();
export const contactListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  name: z.string().trim().max(100).optional(),
  number: z.string().trim().max(64).optional(),
  relative: z.string().trim().max(12).optional(), // profile id | 'all' | 'none'
  sort: z.enum(['name', 'newest', 'number']).default('name'),
  ...pageParams,
});
export const vcfImportSchema = z.object({
  connectionId: optId,
  vcf: z.string().min(10).max(2_000_000),
}).strict();

// ---------- settings ----------
export const siteSettingsSchema = z.object({
  site_name: z.string().trim().min(1).max(60),
  site_description: z.string().trim().max(240),
  registration_enabled: z.boolean(),
  allow_user_contributions: z.boolean(),
  default_theme: z.enum(THEMES),
  contact_email: z.preprocess((v) => (v === '' ? '' : v), z.union([z.literal(''), emailField])),
}).partial().strict();

export const auditQuery = z.object({
  action: z.string().trim().max(60).optional(),
  actor: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  ...pageParams,
});

export const searchQuery = z.object({ q: z.string().trim().min(1).max(100), limit: z.coerce.number().int().min(1).max(20).default(6) });
