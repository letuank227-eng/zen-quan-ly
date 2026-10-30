import { Router } from 'express';
import { TagsController } from '../controllers/tagsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, TagsController.listTags);
router.post('/', authenticate, TagsController.createTag);
router.put('/:id', authenticate, TagsController.updateTag);
router.delete('/:id', authenticate, TagsController.deleteTag);

export default router;
