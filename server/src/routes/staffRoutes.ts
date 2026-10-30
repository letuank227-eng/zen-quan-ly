import { Router } from 'express';
import { StaffController } from '../controllers/staffController';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

const router = Router();

router.get('/', authenticate, StaffController.listStaff);
router.post('/', authenticate, requireAdmin, StaffController.createStaff);
router.put('/:id', authenticate, requireAdmin, StaffController.updateStaff);
router.get('/audit-logs', authenticate, requireAdmin, StaffController.getAuditLogs);

export default router;
