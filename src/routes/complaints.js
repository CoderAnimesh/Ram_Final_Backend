import { Router } from 'express';
import { db } from '../db/index.js';
import { complaints, users, notifications } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import multer from 'multer';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { verifyLiveImage } from '../utils/gemini.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = Router();

// Helper: get DB user from firebase uid
async function getDbUser(firebaseUid) {
  const result = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid)).limit(1);
  return result[0] || null;
}

// POST /complaints — raise a new complaint (user)
router.post('/', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    if (!req.file) {
      return res.status(400).json({ error: 'Live image is required' });
    }

    // Verify it's a live photo
    const verification = await verifyLiveImage(req.file.buffer, req.file.mimetype);
    if (!verification.isLive) {
      return res.status(400).json({ error: `Image verification failed: ${verification.reason}` });
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer, 'complaints_problem');
    const photoUrl = uploadResult.secure_url;

    const { category, description, latitude, longitude, address, area } = req.body;
    const complaint = await db.insert(complaints).values({
      userId: dbUser.id,
      userName: dbUser.name,
      userEmail: dbUser.email,
      category,
      description,
      latitude: String(latitude),
      longitude: String(longitude),
      address,
      area,
      photoUrl,
      status: 'pending',
    }).returning();

    res.status(201).json({ complaint: complaint[0] });
  } catch (err) {
    console.error('Create complaint error:', err);
    res.status(500).json({ error: 'Failed to create complaint' });
  }
});

// GET /complaints/my — get current user's complaints
router.get('/my', verifyToken, async (req, res) => {
  try {
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    const result = await db.select().from(complaints)
      .where(eq(complaints.userId, dbUser.id))
      .orderBy(desc(complaints.createdAt));
    res.json({ complaints: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get complaints' });
  }
});

// GET /complaints — get all complaints (admin)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await db.select().from(complaints).orderBy(desc(complaints.createdAt));
    res.json({ complaints: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get complaints' });
  }
});

// GET /complaints/:id — get single complaint
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const result = await db.select().from(complaints).where(eq(complaints.id, req.params.id)).limit(1);
    if (!result.length) return res.status(404).json({ error: 'Complaint not found' });
    res.json({ complaint: result[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get complaint' });
  }
});

// PATCH /complaints/:id/assign — admin assigns worker
router.patch('/:id/assign', requireAdmin, async (req, res) => {
  try {
    const { workerId, workerName } = req.body;
    const updated = await db.update(complaints)
      .set({ workerId, workerName, status: 'assigned', assignedAt: new Date(), updatedAt: new Date() })
      .where(eq(complaints.id, req.params.id))
      .returning();

    if (!updated.length) return res.status(404).json({ error: 'Complaint not found' });

    // Notify user
    await db.insert(notifications).values({
      userId: updated[0].userId,
      complaintId: updated[0].id,
      message: `Your complaint "${updated[0].category}" has been assigned to ${workerName}. Work is in progress!`,
      type: 'info',
    });

    res.json({ complaint: updated[0] });
  } catch (err) {
    console.error('Assign error:', err);
    res.status(500).json({ error: 'Failed to assign worker' });
  }
});

// PATCH /complaints/:id/reverify — admin sends for reverification
router.patch('/:id/reverify', requireAdmin, async (req, res) => {
  try {
    const updated = await db.update(complaints)
      .set({ status: 'reverification', reverificationAt: new Date(), updatedAt: new Date() })
      .where(eq(complaints.id, req.params.id))
      .returning();

    if (!updated.length) return res.status(404).json({ error: 'Complaint not found' });

    await db.insert(notifications).values({
      userId: updated[0].userId,
      complaintId: updated[0].id,
      message: `Your complaint "${updated[0].category}" is under re-verification by the admin.`,
      type: 'warning',
    });

    res.json({ complaint: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /complaints/:id/resolve — admin marks as resolved
router.patch('/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const updated = await db.update(complaints)
      .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(complaints.id, req.params.id))
      .returning();

    if (!updated.length) return res.status(404).json({ error: 'Complaint not found' });

    await db.insert(notifications).values({
      userId: updated[0].userId,
      complaintId: updated[0].id,
      message: `🎉 Your complaint "${updated[0].category}" has been resolved! Thank you for using SAMADHAN.`,
      type: 'success',
    });

    res.json({ complaint: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve complaint' });
  }
});

export default router;
