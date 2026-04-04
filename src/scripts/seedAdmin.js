/**
 * Run this ONCE to create the admin account in Firebase + Neon DB
 * Usage: node src/scripts/seedAdmin.js
 */
import admin from 'firebase-admin';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

// ── Firebase Admin init ──────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// ── Neon / Drizzle init ──────────────────────────────────────────────────────
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@samadhan.gov.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const ADMIN_NAME     = 'SAMADHAN Admin';

async function seedAdmin() {
  console.log('\n🌱  Seeding admin account...\n');

  // 1️⃣  Create / fetch user in Firebase Auth
  let firebaseUser;
  try {
    firebaseUser = await admin.auth().getUserByEmail(ADMIN_EMAIL);
    console.log('✅  Firebase user already exists:', firebaseUser.uid);
  } catch {
    firebaseUser = await admin.auth().createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: ADMIN_NAME,
      emailVerified: true,
    });
    console.log('✅  Firebase user created:', firebaseUser.uid);
  }

  // 2️⃣  Upsert in Neon DB with role = 'admin'
  const existing = await db.select().from(users)
    .where(eq(users.firebaseUid, firebaseUser.uid)).limit(1);

  if (existing.length > 0) {
    await db.update(users)
      .set({ role: 'admin', name: ADMIN_NAME, updatedAt: new Date() })
      .where(eq(users.firebaseUid, firebaseUser.uid));
    console.log('✅  DB user updated → role: admin');
  } else {
    await db.insert(users).values({
      firebaseUid: firebaseUser.uid,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      role: 'admin',
    });
    console.log('✅  DB user created → role: admin');
  }

  console.log('\n🎉  Admin seeded successfully!');
  console.log(`    Email   : ${ADMIN_EMAIL}`);
  console.log(`    Password: ${ADMIN_PASSWORD}`);
  console.log('\n    You can now log in at http://localhost:5173/login (Admin Login tab)\n');
  process.exit(0);
}

seedAdmin().catch(err => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
