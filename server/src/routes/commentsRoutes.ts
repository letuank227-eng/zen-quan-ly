import { Router } from 'express';
import { CommentsController } from '../controllers/commentsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, CommentsController.listComments);
router.post('/sync/:pageId', authenticate, CommentsController.syncComments);
router.post('/:commentId/reply', authenticate, CommentsController.replyComment);
router.post('/:commentId/private-reply', authenticate, CommentsController.privateReply);
router.put('/:commentId/status', authenticate, CommentsController.updateStatus);

export default router;
