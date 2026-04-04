import { Router } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// POST /auth/sync — called after Firebase login to sync user to DB
router.post('/sync', verifyToken, async (req, res) => {
  try {
    const { uid, name, email, picture } = req.user;
    const existing = await db.select().from(users).where(eq(users.firebaseUid, uid)).limit(1);

    if (existing.length > 0) {
      const updated = await db.update(users)
        .set({ name: name || existing[0].name, photoUrl: picture, updatedAt: new Date() })
        .where(eq(users.firebaseUid, uid))
        .returning();
      return res.json({ user: updated[0] });
    }

    const newUser = await db.insert(users).values({
      firebaseUid: uid,
      name: name || email.split('@')[0],
      email,
      photoUrl: picture || null,
      role: 'user',
    }).returning();

    return res.status(201).json({ user: newUser[0] });
  } catch (err) {
    console.error('Auth sync error:', err);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// GET /auth/me — get current user profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await db.select().from(users).where(eq(users.firebaseUid, req.user.uid)).limit(1);
    if (!user.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
