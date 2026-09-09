import { Router } from 'express';
import { WhatsAppController } from '../controllers/twiliowhatsappController.js';
import { WhatsAppTemplateController } from '../controllers/twiliowhatsappTemplateController.js';
import { notificationRateLimiter } from '../middleware/rateLimit.js';
import { duplicateMessageMiddleware } from '../middleware/duplicateMessage.js';

const router = Router();

// Rate limiting & idempotency for send endpoints (abuse protection, duplicate send protection)
router.use(notificationRateLimiter);
router.use(duplicateMessageMiddleware);

// WhatsApp API routes
router.post('/send-message-twilio', WhatsAppController.sendTemplate);
router.post('/send-message-preview-twilio', WhatsAppController.sendTemplatePreview);
router.post('/send-dynamic-twilio', WhatsAppController.sendDynamic);
router.post('/send-report-media-twilio', WhatsAppController.sendReportMedia);

// From Numbers: list from Meta (GET), add in Meta (POST). Use fromNumberId (Meta phone_number_id) in send-dynamic/send-template/send-text to send from that number.
router.get('/from-numbers-twilio', WhatsAppController.listFromNumbers);
router.post('/from-numbers-twilio', WhatsAppController.addFromNumberInMeta);

// WhatsApp Template Management routes
router.post('/templates/create-twilio', WhatsAppTemplateController.createTemplate);
router.post('/templates/create-custom-twilio', WhatsAppTemplateController.createCustomTemplate);
router.put('/templates/create-custom-edit-twilio', WhatsAppTemplateController.editTemplate);
router.delete('/templates/create-custom-delete-twilio', WhatsAppTemplateController.deleteTemplate);
router.get('/templates-twilio', WhatsAppTemplateController.getTemplates);
router.get('/templates/twillio', WhatsAppTemplateController.getTemplatesFromMeta);
router.get('/templates/:templateName-twilio', WhatsAppTemplateController.getTemplate);
router.post('/templates/register-twilio', WhatsAppTemplateController.registerTemplate);

export default router;
