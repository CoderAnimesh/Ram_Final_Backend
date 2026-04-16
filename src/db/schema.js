import { pgTable, text, timestamp, uuid, varchar, boolean, jsonb, integer } from 'drizzle-orm/pg-core';

// ─── Users ──────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firebaseUid: varchar('firebase_uid', { length: 128 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  photoUrl: text('photo_url'),
  role: varchar('role', { length: 20 }).notNull().default('user'), // 'user' | 'admin'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── Workers ─────────────────────────────────────────────────────────────────
export const workers = pgTable('workers', {
  id: uuid('id').primaryKey().defaultRandom(),
  firebaseUid: varchar('firebase_uid', { length: 128 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  area: varchar('area', { length: 255 }),
  specialization: varchar('specialization', { length: 100 }),
  isAvailable: boolean('is_available').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── Complaints ───────────────────────────────────────────────────────────────
export const complaints = pgTable('complaints', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  userName: varchar('user_name', { length: 255 }),
  userEmail: varchar('user_email', { length: 255 }),

  // Location
  latitude: text('latitude'),
  longitude: text('longitude'),
  address: text('address'),
  area: varchar('area', { length: 255 }),

  // Problem
  category: varchar('category', { length: 100 }).notNull(),
  description: text('description').notNull(),
  photoUrl: text('photo_url'),
  resolvedPhotoUrl: text('resolved_photo_url'),
  similarityScore: integer('similarity_score'),

  // Status flow: pending → assigned → reverification → resolved
  status: varchar('status', { length: 30 }).notNull().default('pending'),

  // Worker assignment
  workerId: uuid('worker_id').references(() => workers.id),
  workerName: varchar('worker_name', { length: 255 }),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  assignedAt: timestamp('assigned_at'),
  reverificationAt: timestamp('reverification_at'),
  resolvedAt: timestamp('resolved_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  complaintId: uuid('complaint_id').references(() => complaints.id),
  message: text('message').notNull(),
  type: varchar('type', { length: 50 }).default('info'), // 'info' | 'success' | 'warning'
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
