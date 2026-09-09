import { Request, Response } from 'express';
import { WhatsAppService } from '../services/twiliowhatsappService.js';
import { ErrorHandler } from '../utils/errorHandler.js';
import { appendFromNumbersLog } from '../utils/logApiResponse.js';
import { isRabbitEnabled, publishNotificationJob } from '../queue/rabbitNotifications.js';

export class WhatsAppController {
      // POST /api/whatsapp/send-message
  // static async sendTemplate(req: Request, res: Response): Promise<void> { 
  //   try {
  //     const { to, templateName, languageCode, components, fromNumberId } = req.body;
  //     if (to == null || to === '') {
  //       ErrorHandler.sendValidationError(res, 'Missing or empty required field: "to" (recipient phone number) is required');
  //       return;
  //     }
  //     const toStr = String(to).trim();
  //     if (toStr.length === 0) {
  //       ErrorHandler.sendValidationError(res, 'Recipient "to" cannot be empty or whitespace only.');
  //       return;
  //     }
  //     if (templateName == null || String(templateName).trim() === '') {
  //       ErrorHandler.sendValidationError(res, 'Missing or empty required field: "templateName" is required');
  //       return;
  //     }
  //     // Use default language code if not provided
  //     const langCode = (languageCode != null && String(languageCode).trim() !== '') ? String(languageCode).trim() : 'en';
      
  //     // Support both old format (parameters array) and new format (components object with body or bodyNamed)
  //     let templateComponents: Array<{
  //       type: string;
  //       parameters?: Array<{ type: string; text?: string; payload?: string; parameter_name?: string }>;
  //       sub_type?: string;
  //       index?: number;
  //     }> | undefined = undefined;

  //     // New dynamic format: components object with header, body (positional or named), buttons
  //     if (components) {
  //       templateComponents = [];
        
  //       // Header component
  //       if (components.header && Array.isArray(components.header)) {
  //         templateComponents.push({
  //           type: 'header',
  //           parameters: components.header.map((param: string | { type: string; text?: string; payload?: string }) => 
  //             typeof param === 'string' ? { type: 'text', text: param } : param
  //           )
  //         });
  //       }
        
  //       // Body: named parameters (object) or positional (array)
  //       if (components.bodyNamed && typeof components.bodyNamed === 'object' && !Array.isArray(components.bodyNamed)) {
  //         templateComponents.push({
  //           type: 'body',
  //           parameters: Object.entries(components.bodyNamed).map(([parameter_name, value]) => ({
  //             type: 'text',
  //             parameter_name,
  //             text: String(value ?? '')
  //           }))
  //         });
  //       } else if (components.body && Array.isArray(components.body)) {
  //         templateComponents.push({
  //           type: 'body',
  //           parameters: components.body.map((param: string | { type: string; text?: string }) => 
  //             typeof param === 'string' ? { type: 'text', text: param } : param
  //           )
  //         });
  //       }
        
  //       // Button components
  //       if (components.buttons && Array.isArray(components.buttons) && templateComponents) {
  //         const componentsArray = templateComponents; // Store reference for TypeScript
  //         components.buttons.forEach((button: { type: string; text?: string; payload?: string; index?: number }, idx: number) => {
  //           if (button.type === 'quick_reply' || button.type === 'url') {
  //             componentsArray.push({
  //               type: 'button',
  //               sub_type: button.type,
  //               index: button.index !== undefined ? button.index : idx,
  //               parameters: button.payload ? [{ type: 'payload', payload: button.payload }] : 
  //                          button.text ? [{ type: 'text', text: button.text }] : []
  //             });
  //           }
  //         });
  //       }
  //     } 
  //     // Legacy format: simple parameters array (for backward compatibility)
  //     else if (req.body.parameters && Array.isArray(req.body.parameters)) {
  //       templateComponents = [{
  //         type: 'body',
  //         parameters: req.body.parameters.map((param: string) => ({
  //           type: 'text',
  //           text: param
  //         }))
  //       }];
  //     }

  //     const fromCredentials = resolveFromNumber(fromNumberId);
  //     const result = await WhatsAppService.sendTemplate(toStr, String(templateName).trim(), langCode, templateComponents || undefined, fromCredentials);
  //     ErrorHandler.sendServiceResult(res, result);
  //   } catch (error) {
  //     ErrorHandler.sendErrorResponse(res, error, 'Error in sendTemplate', 500);
  //   }
  // }

  // preview part only 

  static async sendTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { to, templateName, languageCode, components, fromNumberId, renderHtml } = req.body;
  
      if (to == null || to === '') {
        ErrorHandler.sendValidationError(
          res,
          'Missing or empty required field: "to" (recipient phone number) is required'
        );
        return;
      }
  
      const toStr = String(to).trim();
      if (toStr.length === 0) {
        ErrorHandler.sendValidationError(res, 'Recipient "to" cannot be empty or whitespace only.');
        return;
      }
  
      if (templateName == null || String(templateName).trim() === '') {
        ErrorHandler.sendValidationError(res, 'Missing or empty required field: "templateName" is required');
        return;
      }
  
      const langCode =
        languageCode != null && String(languageCode).trim() !== '' ? String(languageCode).trim() : 'en';
  
      let templateComponents:
        | Array<{
            type: string;
            parameters?: Array<{ type: string; text?: string; payload?: string; parameter_name?: string }>;
            sub_type?: string;
            index?: number;
          }>
        | undefined = undefined;
  
      if (components) {
        templateComponents = [];
  
        // Header
        if (components.header && Array.isArray(components.header)) {
          templateComponents.push({
            type: 'header',
            parameters: components.header.map(
              (param: string | { type: string; text?: string; payload?: string }) =>
                typeof param === 'string' ? { type: 'text', text: param } : param
            )
          });
        }
  
        // Body named
        if (components.bodyNamed && typeof components.bodyNamed === 'object' && !Array.isArray(components.bodyNamed)) {
          templateComponents.push({
            type: 'body',
            parameters: Object.entries(components.bodyNamed).map(([parameter_name, value]) => ({
              type: 'text',
              parameter_name,
              text: String(value ?? '')
            }))
          });
        }
        // Body array
        else if (components.body && Array.isArray(components.body)) {
          templateComponents.push({
            type: 'body',
            parameters: components.body.map((param: string | { type: string; text?: string }) =>
              typeof param === 'string' ? { type: 'text', text: param } : param
            )
          });
        }
  
        // Buttons
        if (components.buttons && Array.isArray(components.buttons) && templateComponents) {
          const componentsArray = templateComponents;
          components.buttons.forEach(
            (button: { type: string; text?: string; payload?: string; index?: number }, idx: number) => {
              if (button.type === 'quick_reply' || button.type === 'url') {
                componentsArray.push({
                  type: 'button',
                  sub_type: button.type,
                  index: button.index !== undefined ? button.index : idx,
                  parameters: button.payload
                    ? [{ type: 'payload', payload: button.payload }]
                    : button.text
                    ? [{ type: 'text', text: button.text }]
                    : []
                });
              }
            }
          );
        }
      }
      // Legacy parameters
      else if (req.body.parameters && Array.isArray(req.body.parameters)) {
        templateComponents = [
          {
            type: 'body',
            parameters: req.body.parameters.map((param: string) => ({
              type: 'text',
              text: param
            }))
          }
        ];
      }
  
      const fromCredentials = resolveFromNumber(fromNumberId);
      if (isRabbitEnabled()) {
        const queued = await publishNotificationJob('whatsapp_send_message_twilio', {
          to: toStr,
          templateName: String(templateName).trim(),
          languageCode: langCode,
          components: templateComponents || undefined,
          fromCredentials
        });

        ErrorHandler.sendSuccess(res, {
          message: 'WhatsApp request queued',
          data: {
            queued: queued.queued,
            jobId: queued.jobId,
            endpoint: 'api-twilio/whatsapp/send-message-twilio'
          }
        }, 202);
        return;
      }

      const result = await WhatsAppService.sendTemplate(
        toStr,
        String(templateName).trim(),
        langCode,
        templateComponents || undefined,
        fromCredentials
      );
  
      // ✅ HTML render flag (query OR body)
      const shouldRenderHtml =
        req.query.renderHtml === '1' ||
        req.query.renderHtml === 'true' ||
        renderHtml === true;
  
      if (shouldRenderHtml) {
        const html = (result as any)?.meta?.htmlPreview;
        if (typeof html === 'string' && html.trim()) {
          res.status(200).type('html').send(html);
          return;
        }
  
        // If htmlPreview is missing, fall back to JSON
        ErrorHandler.sendServiceResult(res, result);
        return;
      }
  
      // Default JSON
      ErrorHandler.sendServiceResult(res, result);
    } catch (error) {
      ErrorHandler.sendErrorResponse(res, error, 'Error in sendTemplate', 500);
    }
  }

  // POST /api-twilio/whatsapp/send-report-media-twilio
  // Renders ns_temp_Notification_temp2 (or given template) HTML -> image/pdf,
  // hosts it publicly, then sends via WhatsApp media template.
  // Does NOT disturb existing text/template sending.
  static async sendReportMedia(req: Request, res: Response): Promise<void> {
    try {
      const {
        to,
        reportTemplateName,   // email template to render (default ns_temp_Notification_temp2)
        whatsappTemplateName, // Twilio content template with media header
        format,               // 'image' | 'pdf' (default 'image')
        parameters,           // store data (same shape as email dynamic)
        bodyVariables,        // caption/button vars for the WhatsApp template
        mediaVariableKey,     // template var name/index for the media header (default "MediaUrl")
        mediaUrlMode,         // "full" (default) sends complete URL | "filename" sends only filename WITHOUT extension
        fromNumberId,
      } = req.body;

      const toStr = to != null ? String(to).trim() : '';
      if (!toStr) {
        ErrorHandler.sendValidationError(res, 'Missing or empty required field: "to".');
        return;
      }
      const waTemplate = whatsappTemplateName != null ? String(whatsappTemplateName).trim() : '';
      if (!waTemplate) {
        ErrorHandler.sendValidationError(res, 'Missing "whatsappTemplateName" (Twilio media template).');
        return;
      }
      const reportTemplate = (reportTemplateName != null && String(reportTemplateName).trim() !== '')
        ? String(reportTemplateName).trim()
        : 'ns_temp_Notification_temp2';
      const outFormat = (format != null && String(format).trim().toLowerCase() === 'pdf') ? 'pdf' : 'image';

      // 1) Build the fully-rendered HTML using the SAME logic as email preview
      const { buildTemplateParams } = await import('../utils/templateParamsBuilder.js');
      const { getEmailTemplate } = await import('../templates/twilioemailTemplates.js');

      const tpl = getEmailTemplate(reportTemplate);
      if (!tpl) {
        ErrorHandler.sendValidationError(res, 'Report template "' + reportTemplate + '" not found.');
        return;
      }
      const builtParams = buildTemplateParams(reportTemplate, parameters || {});
      let html = tpl.html.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (m: string, key: string) => {
        const trimmed = key.trim();
        return trimmed in builtParams ? String(builtParams[trimmed] ?? '') : m;
      });
      // Convert escaped \n back to real newlines for PositiveChanges/RequiresReviews
      html = html.replace(/\\n/g, '\n');

      // 2) Render to image or pdf
      const { renderHtmlToImage, renderHtmlToPdf } = await import('../utils/reportRenderer.js');
      const rendered = outFormat === 'pdf' ? await renderHtmlToPdf(html) : await renderHtmlToImage(html);
      if (!rendered.ok || !rendered.publicUrl) {
        ErrorHandler.sendErrorResponse(res, new Error(rendered.error || 'Render failed'), 'Failed to render report media', 500);
        return;
      }

      // 3) Send via WhatsApp media template
      const fromCredentials = resolveFromNumber(fromNumberId);
      const mediaKey = (mediaVariableKey != null && String(mediaVariableKey).trim() !== '')
        ? String(mediaVariableKey).trim()
        : 'MediaUrl';

      // Media value based on mode: 'full' (default) = complete URL; 'filename' = filename without extension
      const mode = String(mediaUrlMode || 'full').trim().toLowerCase();
      let mediaValue = rendered.publicUrl;
      if (mode === 'filename' && rendered.fileName) {
        mediaValue = rendered.fileName.replace(/\.[^.]+$/, '');
      }

      // If RabbitMQ is enabled, queue the media send (rendering already done above).
      // This mirrors send-message/send-dynamic queue behavior. Falls back to direct send otherwise.
      if (isRabbitEnabled()) {
        const queued = await publishNotificationJob('whatsapp_send_media_twilio', {
          to: toStr,
          templateName: waTemplate,
          mediaValue,
          bodyVariables: bodyVariables || {},
          mediaVariableKey: mediaKey,
          fromCredentials,
        });

        ErrorHandler.sendSuccess(res, {
          message: 'WhatsApp report media queued',
          data: {
            queued: queued.queued,
            jobId: queued.jobId,
            mediaUrl: rendered.publicUrl,
            format: outFormat,
            bytes: rendered.bytes,
            endpoint: 'api-twilio/whatsapp/send-report-media-twilio',
          },
        }, 202);
        return;
      }

      const result = await WhatsAppService.sendMediaTemplate(
        toStr,
        waTemplate,
        mediaValue,
        bodyVariables || {},
        fromCredentials,
        mediaKey
      );

      if (!result.ok) {
        ErrorHandler.sendServiceResult(res, result);
        return;
      }

      ErrorHandler.sendSuccess(res, {
        message: 'WhatsApp report media sent',
        data: {
          ...(result as any).meta,
          mediaUrl: rendered.publicUrl,
          format: outFormat,
          bytes: rendered.bytes,
        },
      });
    } catch (error) {
      ErrorHandler.sendErrorResponse(res, error, 'Error in sendReportMedia', 500);
    }
  }

  // use
  // POST /api/whatsapp/send-message-preview - Preview template without sending
  static async sendTemplatePreview(req: Request, res: Response): Promise<void> {
    try {
      const { to, templateName, languageCode, components, fromNumberId, renderHtml } = req.body;
  
      if (to == null || to === '') {
        ErrorHandler.sendValidationError(
          res,
          'Missing or empty required field: "to" (recipient phone number) is required'
        );
        return;
      }
  
      const toStr = String(to).trim();
      if (toStr.length === 0) {
        ErrorHandler.sendValidationError(res, 'Recipient "to" cannot be empty or whitespace only.');
        return;
      }
  
      if (templateName == null || String(templateName).trim() === '') {
        ErrorHandler.sendValidationError(res, 'Missing or empty required field: "templateName" is required');
        return;
      }
  
      const langCode =
        languageCode != null && String(languageCode).trim() !== '' ? String(languageCode).trim() : 'en';
  
      let templateComponents:
        | Array<{
            type: string;
            parameters?: Array<{ type: string; text?: string; payload?: string; parameter_name?: string }>;
            sub_type?: string;
            index?: number;
          }>
        | undefined = undefined;
  
      if (components) {
        templateComponents = [];
  
        // Header
        if (components.header && Array.isArray(components.header)) {
          templateComponents.push({
            type: 'header',
            parameters: components.header.map(
              (param: string | { type: string; text?: string; payload?: string }) =>
                typeof param === 'string' ? { type: 'text', text: param } : param
            )
          });
        }
  
        // Body named
        if (components.bodyNamed && typeof components.bodyNamed === 'object' && !Array.isArray(components.bodyNamed)) {
          templateComponents.push({
            type: 'body',
            parameters: Object.entries(components.bodyNamed).map(([parameter_name, value]) => ({
              type: 'text',
              parameter_name,
              text: String(value ?? '')
            }))
          });
        }
        // Body array
        else if (components.body && Array.isArray(components.body)) {
          templateComponents.push({
            type: 'body',
            parameters: components.body.map((param: string | { type: string; text?: string }) =>
              typeof param === 'string' ? { type: 'text', text: param } : param
            )
          });
        }
  
        // Buttons
        if (components.buttons && Array.isArray(components.buttons) && templateComponents) {
          const componentsArray = templateComponents;
          components.buttons.forEach(
            (button: { type: string; text?: string; payload?: string; index?: number }, idx: number) => {
              if (button.type === 'quick_reply' || button.type === 'url') {
                componentsArray.push({
                  type: 'button',
                  sub_type: button.type,
                  index: button.index !== undefined ? button.index : idx,
                  parameters: button.payload
                    ? [{ type: 'payload', payload: button.payload }]
                    : button.text
                    ? [{ type: 'text', text: button.text }]
                    : []
                });
              }
            }
          );
        }
      }
      // Legacy parameters
      else if (req.body.parameters && Array.isArray(req.body.parameters)) {
        templateComponents = [
          {
            type: 'body',
            parameters: req.body.parameters.map((param: string) => ({
              type: 'text',
              text: param
            }))
          }
        ];
      }
  
      const fromCredentials = resolveFromNumber(fromNumberId);
  
      const result = await WhatsAppService.sendTemplatePreview(
        toStr,
        String(templateName).trim(),
        langCode,
        templateComponents || undefined,
        fromCredentials
      );
  
      // ✅ HTML render flag (query OR body) - Preview always returns HTML
      const shouldRenderHtml =
        req.query.renderHtml === '1' ||
        req.query.renderHtml === 'true' ||
        renderHtml === true ||
        true; // Default to HTML for preview
  
      if (shouldRenderHtml) {
        const html = (result as any)?.meta?.htmlPreview;
        if (typeof html === 'string' && html.trim()) {
          res.status(200).type('html').send(html);
          return;
        }
  
        // If htmlPreview is missing, fall back to JSON
        ErrorHandler.sendServiceResult(res, result);
        return;
      }
  
      // Default JSON
      ErrorHandler.sendServiceResult(res, result);
    } catch (error) {
      ErrorHandler.sendErrorResponse(res, error, 'Error in sendTemplatePreview', 500);
    }
  }
  
  




  // POST /api/whatsapp/send-dynamic - Flexible template with dynamic parameters
  static async sendDynamic(req: Request, res: Response): Promise<void> {
    try {
      const { to, templateName, languageCode, parameters, components, fromNumberId } = req.body;

      const toStr = to != null ? String(to).trim() : '';
      if (!toStr) {
        ErrorHandler.sendValidationError(res, 'Missing or empty required field: "to" (recipient phone number) is required');
        return;
      }
      if (templateName == null || String(templateName).trim() === '') {
        ErrorHandler.sendValidationError(res, 'Missing or empty required field: "templateName" is required');
        return;
      }

      const langCode = (languageCode != null && String(languageCode).trim() !== '') ? String(languageCode).trim() : 'en';

      // When components is provided (body/bodyNamed/header/buttons), build WhatsApp components and send directly.
      // Supports positional (components.body array) and named (components.bodyNamed object) parameters.
      if (components && (components.body ?? components.bodyNamed ?? components.header ?? components.buttons)) {
        const templateComponents: Array<{
          type: string;
          parameters?: Array<{ type: string; text?: string; payload?: string; parameter_name?: string }>;
          sub_type?: string;
          index?: number;
        }> = [];

        if (components.header && Array.isArray(components.header)) {
          templateComponents.push({
            type: 'header',
            parameters: components.header.map((param: string | { type: string; text?: string; payload?: string }) =>
              typeof param === 'string' ? { type: 'text', text: param } : param
            )
            
          });
        }
        if (components.bodyNamed && typeof components.bodyNamed === 'object' && !Array.isArray(components.bodyNamed)) {
          templateComponents.push({
            type: 'body',
            parameters: Object.entries(components.bodyNamed).map(([parameter_name, value]) => ({
              type: 'text',
              parameter_name,
              text: String(value ?? '')
            }))
          });
        } else if (components.body && Array.isArray(components.body)) {
          templateComponents.push({
            type: 'body',
            parameters: components.body.map((param: string | { type: string; text?: string }) =>
              typeof param === 'string' ? { type: 'text', text: param } : param
            )
          });
        }
        if (components.buttons && Array.isArray(components.buttons)) {
          components.buttons.forEach((button: { type: string; text?: string; payload?: string; index?: number }, idx: number) => {
            if (button.type === 'quick_reply' || button.type === 'url') {
              templateComponents.push({
                type: 'button',
                sub_type: button.type,
                index: button.index !== undefined ? button.index : idx,
                parameters: button.payload ? [{ type: 'payload', payload: button.payload }] :
                  button.text ? [{ type: 'text', text: button.text }] : []
              });
            }
          });
        }

        const fromCredentials = resolveFromNumber(fromNumberId);
        const result = await WhatsAppService.sendTemplate(toStr, String(templateName).trim(), langCode, templateComponents, fromCredentials);
        ErrorHandler.sendServiceResult(res, result);
        return;
      }

      // Legacy: parameters object + TemplateBuilder (uses template config / fieldOrder)
      const params = parameters || {};
      const { TemplateBuilder } = await import('../services/twiliotemplateBuilder.js');
      const { getTemplateConfig } = await import('../config/twiliotemplateConfigs.js');

      const config = getTemplateConfig(templateName);
      if (config) {
        const validation = TemplateBuilder.validateParameters(params, config);
        if (!validation.valid) {
          ErrorHandler.sendValidationError(res, 'Missing required fields', validation.missing);
          return;
        }
      }

      const builtComponents = TemplateBuilder.buildWhatsAppComponents(params, config || {
        name: templateName,
        requiredFields: [],
        optionalFields: [],
        fieldOrder: Object.keys(params)
      });

      const fromCredentials = resolveFromNumber(fromNumberId);
      const result = await WhatsAppService.sendTemplate(toStr, String(templateName).trim(), langCode, builtComponents, fromCredentials);
      ErrorHandler.sendServiceResult(res, result);
    } catch (error) {
      ErrorHandler.sendErrorResponse(res, error, 'Error in sendDynamic', 500);
    }
  }

  // From Numbers (fetched from Meta) 

  // GET /api/whatsapp/from-numbers - List all "From" numbers from Meta (WABA phone_numbers). Uses .env WHATSAPP_BUSINESS_ACCOUNT_ID and token. 
  static async listFromNumbers(_req: Request, res: Response): Promise<void> {
    try {
      const result = await WhatsAppService.getFromNumbersFromMeta();
      if (!result.ok) {
        res.status(result.error?.status ?? 500).json({ ok: false, error: result.error });
        return;
      }
      appendFromNumbersLog(_req.body, result);
      
      ErrorHandler.sendSuccess(res, {
        message: 'From numbers retrieved from Meta successfully',
        count: result.data?.length ?? 0,
        data: result.data ?? []
      });
    } catch (error) {
      appendFromNumbersLog(_req.body, { error: error });
      ErrorHandler.sendErrorResponse(res, error, 'Error in listFromNumbers', 500);
    }
  }

  // POST /api/whatsapp/from-numbers - Add a From number in Meta
  static async addFromNumberInMeta(req: Request, res: Response): Promise<void> {
    try {
      const { cc, phone_number, verified_name } = req.body;
      if (cc == null || String(cc).trim() === '') {
        ErrorHandler.sendValidationError(res, 'Missing or empty required field: "cc" (country calling code, e.g. 91 for India) is required');
        return;
      }
      if (phone_number == null || String(phone_number).trim() === '') {
        ErrorHandler.sendValidationError(res, 'Missing or empty required field: "phone_number" is required');
        return;
      }
      const result = await WhatsAppService.addFromNumberInMeta(String(cc).trim(), String(phone_number).trim(), verified_name != null ? String(verified_name).trim() : undefined);
      if (!result.ok) {
        res.status(result.error?.status ?? 500).json({ ok: false, error: result.error });
        return;
      }
      appendFromNumbersLog(req.body, result);
      ErrorHandler.sendSuccess(res, {
        message: 'From number added in Meta successfully. Use the returned "id" (phone_number_id) as fromNumberId when sending messages.',
        data: result.data
      }, 201);
    } catch (error) {
      appendFromNumbersLog(req.body, { error: error });
      ErrorHandler.sendErrorResponse(res, error, 'Error in addFromNumberInMeta', 500);
    }
  }
}

// Resolve fromNumberId (Meta phone_number_id string) to { phoneNumberId, accessToken } using env token. 
function resolveFromNumber(fromNumberId: unknown): { phoneNumberId: string; accessToken: string } | undefined {
  if (fromNumberId == null || fromNumberId === '') return undefined;
  const id = String(fromNumberId).trim();
  if (id.length === 0) return undefined;
  return WhatsAppService.getCredentialsForPhoneNumberId(id) ?? undefined;
}




