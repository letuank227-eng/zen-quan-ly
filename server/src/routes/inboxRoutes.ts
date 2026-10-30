import { Router } from 'express';
import { InboxController } from '../controllers/inboxController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, InboxController.getUnifiedInbox);

export default router;
