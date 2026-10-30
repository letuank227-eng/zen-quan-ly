import { Router } from 'express';
import { AdsController } from '../controllers/adsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/accounts', authenticate, AdsController.getAdAccounts);
router.post('/sync', authenticate, AdsController.syncAdsData);
router.get('/insights', authenticate, AdsController.getAdInsights);

export default router;
