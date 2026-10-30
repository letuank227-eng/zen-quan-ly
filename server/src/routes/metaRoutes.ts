import { Router } from 'express';
import { MetaController } from '../controllers/metaController';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

const router = Router();

// OAuth flow
router.get('/connect-url', authenticate, requireAdmin, MetaController.getConnectUrl);
router.get('/oauth/callback', MetaController.handleOAuthCallback);

// Pages discovery & connection
router.get('/available-pages', authenticate, requireAdmin, MetaController.getAvailablePages);
router.post('/connect-pages', authenticate, requireAdmin, MetaController.connectSelectedPages);
router.post('/connect-direct', authenticate, requireAdmin, MetaController.connectPageDirectly);
router.post('/connect-token', authenticate, requireAdmin, MetaController.connectToken);
router.post('/disconnect-page/:pageId', authenticate, requireAdmin, MetaController.disconnectPage);
router.post('/disconnect-account', authenticate, requireAdmin, MetaController.disconnectAccount);

// Health check & settings
router.get('/health', authenticate, MetaController.checkHealth);
router.get('/settings', authenticate, requireAdmin, MetaController.getSettings);
router.post('/settings', authenticate, requireAdmin, MetaController.saveSettings);

// Live customer avatar resolver
router.get('/avatar/:metaId', MetaController.resolveCustomerAvatar);

export default router;
