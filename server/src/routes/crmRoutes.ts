import { Router } from 'express';
import multer from 'multer';
import { CrmController } from '../controllers/crmController';
import { authenticate } from '../middleware/auth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const router = Router();

router.get('/', authenticate, CrmController.listCustomers);
router.get('/:id', authenticate, CrmController.getCustomerDetail);
router.put('/:id', authenticate, CrmController.updateCustomer);
router.post('/:customerId/notes', authenticate, CrmController.addNote);
router.delete('/notes/:noteId', authenticate, CrmController.deleteNote);
router.post('/tags/attach', authenticate, CrmController.attachTag);
router.delete('/tags/:customerId/:tagId', authenticate, CrmController.detachTag);
router.post('/:id/refresh-profile', authenticate, CrmController.refreshCustomerMetaProfile);
router.post('/:id/avatar', authenticate, upload.single('avatar'), CrmController.uploadAvatar);

export default router;
