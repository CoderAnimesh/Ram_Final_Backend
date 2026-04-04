import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', details: err.message });
  }
};

export const requireAdmin = async (req, res, next) => {
  await verifyToken(req, res, async () => {
    const { db } = await import('../db/index.js');
    const { users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const user = await db.select().from(users).where(eq(users.firebaseUid, req.user.uid)).limit(1);
    if (!user.length || user[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.dbUser = user[0];
    next();
  });
};
