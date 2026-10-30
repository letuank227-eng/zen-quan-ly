import { Router } from 'express';
import { PagesController } from '../controllers/pagesController';
import { authenticate } from '../middleware/auth';
import { checkPageAccess, requireAdmin } from '../middleware/rbac';

const router = Router();

router.get('/', authenticate, PagesController.listPages);
router.get('/:id', authenticate, checkPageAccess, PagesController.getPageDetail);
router.post('/:id/sync', authenticate, requireAdmin, PagesController.syncPage);

export default router;
