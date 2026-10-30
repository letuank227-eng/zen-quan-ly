import { Router } from 'express';
import multer from 'multer';
import { MessengerController } from '../controllers/messengerController';
import { authenticate } from '../middleware/auth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = Router();

router.get('/conversations', authenticate, MessengerController.getConversations);
router.get('/conversations/:conversationId/messages', authenticate, MessengerController.getMessages);
router.post('/conversations/:conversationId/messages', authenticate, MessengerController.sendMessage);
router.post('/conversations/:conversationId/attachments', authenticate, upload.single('file'), MessengerController.sendAttachment);
router.post('/sync', authenticate, MessengerController.syncConversations);
router.put('/conversations/:conversationId/status', authenticate, MessengerController.updateStatus);
router.put('/conversations/:conversationId/assign', authenticate, MessengerController.assignStaff);

export default router;
