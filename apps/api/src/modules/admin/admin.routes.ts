import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('ADMIN'));

// Replaced by real admin endpoints in Phase 4; proves the guard works end to end.
adminRouter.get('/ping', (req, res) => {
  res.json({ success: true, data: { adminId: req.user!.id } });
});
