import { Router } from 'express';
import { db } from '../db/index.js';
import { workers, users, complaints } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAdmin, verifyToken } from '../middleware/auth.js';
import admin from 'firebase-admin';

const router = Router();

// GET /workers — list all workers (admin)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await db.select().from(workers).orderBy(workers.name);
    res.json({ workers: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get workers' });
  }
});

// GET /workers/available — list available workers (admin, for assignment dropdown)
router.get('/available', requireAdmin, async (req, res) => {
  try {
    const result = await db.select().from(workers).where(eq(workers.isAvailable, true));
    res.json({ workers: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get available workers' });
  }
});

// POST /workers — add a new worker (admin)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, phone, area, specialization, email, password } = req.body;
    
    // 1. Create in Firebase
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email,
        password,
        displayName: name,
      });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // 2. Create in Users (for role tracking)
    await db.insert(users).values({
      firebaseUid: firebaseUser.uid,
      name,
      email,
      role: 'worker',
    });

    // 3. Create in Workers
    const worker = await db.insert(workers).values({ 
      firebaseUid: firebaseUser.uid,
      email, name, phone, area, specialization 
    }).returning();
    
    res.status(201).json({ worker: worker[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add worker' });
  }
});

// PATCH /workers/:id — update worker (admin)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, phone, area, specialization, isAvailable } = req.body;
    const updated = await db.update(workers)
      .set({ name, phone, area, specialization, isAvailable })
      .where(eq(workers.id, req.params.id))
      .returning();
    res.json({ worker: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update worker' });
  }
});

// DELETE /workers/:id — remove worker (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // 1. Unassign all complaints associated with this worker to prevent foreign key constraint errors
    await db.update(complaints)
      .set({ workerId: null, workerName: null, status: 'pending' })
      .where(eq(complaints.workerId, req.params.id));

    // 2. Delete the worker
    await db.delete(workers).where(eq(workers.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

// ─── Worker Dashboard Routes ──────────────────────────────────────────────────

// GET /workers/my-complaints — list complaints assigned to logged-in worker
router.get('/my-complaints', verifyToken, async (req, res) => {
  try {
    const worker = await db.select().from(workers).where(eq(workers.firebaseUid, req.user.uid)).limit(1);
    if (!worker.length) return res.status(403).json({ error: 'Not a worker' });

    const assigned = await db.select().from(complaints)
      .where(and(eq(complaints.workerId, worker[0].id), eq(complaints.status, 'assigned')))
      .orderBy(complaints.assignedAt);
    
    res.json({ complaints: assigned });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PATCH /workers/complete-complaint/:id
router.patch('/complete-complaint/:id', verifyToken, async (req, res) => {
  try {
    const worker = await db.select().from(workers).where(eq(workers.firebaseUid, req.user.uid)).limit(1);
    if (!worker.length) return res.status(403).json({ error: 'Not a worker' });

    const updated = await db.update(complaints)
      .set({ status: 'reverification', reverificationAt: new Date(), updatedAt: new Date() })
      .where(and(eq(complaints.id, req.params.id), eq(complaints.workerId, worker[0].id)))
      .returning();

    if (!updated.length) return res.status(404).json({ error: 'Complaint not found or not assigned to you' });

    res.json({ success: true, complaint: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete complaint' });
  }
});

export default router;
