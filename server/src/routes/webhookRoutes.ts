import { Router } from 'express';
import { WebhookController } from '../controllers/webhookController';

const router = Router();

// Meta Webhook Verification (GET) & Event Delivery (POST)
router.get('/meta', WebhookController.verifyWebhook);
router.post('/meta', WebhookController.handleWebhookEvent);

export default router;
