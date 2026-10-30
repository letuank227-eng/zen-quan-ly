import { Router } from 'express';
import { PostsController } from '../controllers/postsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, PostsController.listPosts);
router.get('/:id', authenticate, PostsController.getPostDetail);
router.post('/sync/:pageId', authenticate, PostsController.syncPosts);

export default router;
