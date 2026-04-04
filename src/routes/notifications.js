import { Router } from 'express';
import { db } from '../db/index.js';
import { notifications, users } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// GET /notifications — get current user's notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const dbUser = await db.select().from(users).where(eq(users.firebaseUid, req.user.uid)).limit(1);
    if (!dbUser.length) return res.status(404).json({ error: 'User not found' });

    const result = await db.select().from(notifications)
      .where(eq(notifications.userId, dbUser[0].id))
      .orderBy(desc(notifications.createdAt));

    res.json({ notifications: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// PATCH /notifications/:id/read — mark single notification as read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const updated = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, req.params.id))
      .returning();
    res.json({ notification: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// PATCH /notifications/read-all — mark all as read
router.patch('/read-all', verifyToken, async (req, res) => {
  try {
    const dbUser = await db.select().from(users).where(eq(users.firebaseUid, req.user.uid)).limit(1);
    if (!dbUser.length) return res.status(404).json({ error: 'User not found' });
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, dbUser[0].id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

export default router;
