import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/dashboard', authenticate, AnalyticsController.getDashboardOverview);
router.get('/page/:pageId', authenticate, AnalyticsController.getPageInsights);

export default router;
