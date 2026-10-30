import { Router } from 'express';
import { NotificationsController } from '../controllers/notificationsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, NotificationsController.listNotifications);
router.put('/:id/read', authenticate, NotificationsController.markAsRead);
router.put('/read-all', authenticate, NotificationsController.markAllAsRead);
router.post('/test-incoming', authenticate, NotificationsController.testIncoming);

export default router;
