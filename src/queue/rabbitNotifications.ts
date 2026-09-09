import amqp, { ConfirmChannel, ConsumeMessage } from "amqplib";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/logs-client";
import { EmailService } from "../services/twilioemailService.js";
import { WhatsAppService } from "../services/twiliowhatsappService.js";

export type NotificationJobType =
  | "email_send_dynamic_twilio"
  | "whatsapp_send_message_twilio"
  | "whatsapp_send_media_twilio";

export interface EmailDynamicQueuePayload {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{ filename: string; content: string }>;
  logContext?: {
    endpoint?: string;
    parameters?: Record<string, unknown>;
    templateName?: string;
  };
}

export interface WhatsAppTemplateQueuePayload {
  to: string;
  templateName: string;
  languageCode: string;
  components?: Array<{
    type: string;
    parameters?: Array<{
      type: string;
      text?: string;
      payload?: string;
      parameter_name?: string;
    }>;
    sub_type?: string;
    index?: number;
  }>;
  fromCredentials?: { phoneNumberId: string; accessToken: string };
}

export interface WhatsAppMediaQueuePayload {
  to: string;
  templateName: string;      // Twilio content template with media header
  mediaValue: string;        // full URL or bare filename (see mediaVariableKey)
  bodyVariables?: Record<string, unknown>;
  mediaVariableKey?: string; // default handled by service (MediaUrl)
  fromCredentials?: { phoneNumberId: string; accessToken: string };
}

type NotificationJobPayload =
  | EmailDynamicQueuePayload
  | WhatsAppTemplateQueuePayload
  | WhatsAppMediaQueuePayload;

interface NotificationJobMessage {
  jobId: string;
  type: NotificationJobType;
  payload: NotificationJobPayload;
  createdAt: string;
}

// --- Custom error for 429 rate-limit from external APIs ---
class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

const logsPrisma = new PrismaClient();
let channel: ConfirmChannel | null = null;
let setupPromise: Promise<ConfirmChannel> | null = null;

const isDryRun = (): boolean => process.env.DRY_RUN_MODE === "true";

const cfg = {
  url: process.env.RABBITMQ_URL || "amqp://127.0.0.1:5672",
  exchange: process.env.RABBITMQ_EXCHANGE || "netsight.notifications",
  retryExchange:
    process.env.RABBITMQ_RETRY_EXCHANGE || "netsight.notifications.retry",
  dlxExchange:
    process.env.RABBITMQ_DLX_EXCHANGE || "netsight.notifications.dlx",
  route: process.env.RABBITMQ_ROUTE || "notify.process",
  retryRoute: process.env.RABBITMQ_RETRY_ROUTE || "notify.retry",
  dlqRoute: process.env.RABBITMQ_DLQ_ROUTE || "notify.failed",
  queue: process.env.RABBITMQ_QUEUE || "netsight.notifications.main",
  retryQueue:
    process.env.RABBITMQ_RETRY_QUEUE || "netsight.notifications.retry",
  dlq: process.env.RABBITMQ_DLQ || "netsight.notifications.dlq",
  maxRetries: Number(process.env.RABBITMQ_MAX_RETRIES || 3),
  // 429 rate-limited jobs get more attempts before DLQ
  maxRetriesRateLimit: Number(process.env.RABBITMQ_MAX_RETRIES_RATE_LIMIT || 6),
  prefetch: Number(process.env.RABBITMQ_PREFETCH || 10),
  retryDelays: String(
    process.env.RABBITMQ_RETRY_DELAYS_MS || "5000,30000,120000",
  )
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v >= 0),
  // DLQ alerting WhatsApp number
  dlqAlertPhone: process.env.DLQ_ALERT_WHATSAPP || "+918698673161",
};

// --- Point 4: Startup config validation ---
export function validateRabbitConfig(): void {
  if (!isRabbitEnabled()) return;

  const url = process.env.RABBITMQ_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "[RabbitMQ] RABBITMQ_ENABLED=true but RABBITMQ_URL is missing. " +
        "Set RABBITMQ_URL (e.g. amqp://user:pass@host:5672) or disable RabbitMQ.",
    );
  }

  // Basic URL format validation
  if (!url.startsWith("amqp://") && !url.startsWith("amqps://")) {
    throw new Error(
      `[RabbitMQ] RABBITMQ_URL is malformed: "${url}". ` +
        "Must start with amqp:// or amqps://",
    );
  }
}

export function isRabbitEnabled(): boolean {
  return (
    process.env.RABBITMQ_ENABLED === "true" ||
    process.env.RABBITMQ_ENABLED === "1"
  );
}

function safeJson(value: unknown): string {
  try {
    // Error objects don't stringify (non-enumerable props), so extract manually
    if (value instanceof Error) {
      return JSON.stringify({
        message: value.message,
        name: value.name,
        stack: value.stack?.split('\n').slice(0, 3).join(' | '),
      });
    }
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ fallback: "serialization_failed" });
  }
}

function deriveMeta(type: NotificationJobType): {
  channel: string;
  endpoint: string;
} {
  if (type === "email_send_dynamic_twilio") {
    return {
      channel: "email",
      endpoint: "api-twilio/email/send-dynamic-twilio",
    };
  }
  if (type === "whatsapp_send_media_twilio") {
    return {
      channel: "whatsapp",
      endpoint: "api-twilio/whatsapp/send-report-media-twilio",
    };
  }
  return {
    channel: "whatsapp",
    endpoint: "api-twilio/whatsapp/send-message-twilio",
  };
}

// --- Detect 429 from external API errors (Twilio / Mailjet) ---
function extractRateLimitDelay(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const err = error as Record<string, unknown>;

  // Twilio returns status 429 with a Retry-After header in the error object
  const status =
    (err.status as number) ??
    (err.statusCode as number) ??
    (err.code as number);

  if (status !== 429) return null;

  // Try to read Retry-After (seconds) from error metadata
  const retryAfter =
    (err.retryAfter as number | string) ??
    (err.headers as Record<string, string>)?.["retry-after"] ??
    (err.response as { headers?: Record<string, string> })?.headers?.[
      "retry-after"
    ];

  if (retryAfter !== undefined && retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000; // convert to ms
    }
  }

  // Default: 60 seconds if 429 but no Retry-After header
  return 60_000;
}

// --- DB tracking (all wrapped safely for consumer use) ---
async function trackQueued(job: NotificationJobMessage): Promise<void> {
  const meta = deriveMeta(job.type);
  await logsPrisma.notificationJobTracking.create({
    data: {
      job_id: job.jobId,
      job_type: job.type,
      channel: meta.channel,
      endpoint: meta.endpoint,
      status: "queued",
      attempts: 0,
      max_attempts: cfg.maxRetries,
      request_payload: safeJson(job.payload),
    },
  });
}

async function trackProcessing(
  jobId: string,
  attempts: number,
): Promise<void> {
  await logsPrisma.notificationJobTracking.update({
    where: { job_id: jobId },
    data: {
      status: "processing",
      attempts,
      last_error: null,
    },
  });
}

async function trackSucceeded(
  jobId: string,
  attempts: number,
  response: unknown,
): Promise<void> {
  await logsPrisma.notificationJobTracking.update({
    where: { job_id: jobId },
    data: {
      status: "succeeded",
      attempts,
      response_payload: safeJson(response),
      processed_at: new Date(),
      next_retry_at: null,
    },
  });
}

async function trackRetry(
  jobId: string,
  attempts: number,
  error: unknown,
  delayMs: number,
): Promise<void> {
  await logsPrisma.notificationJobTracking.update({
    where: { job_id: jobId },
    data: {
      status: "retrying",
      attempts,
      last_error: safeJson(error),
      next_retry_at: new Date(Date.now() + delayMs),
    },
  });
}

async function trackDead(
  jobId: string,
  attempts: number,
  error: unknown,
): Promise<void> {
  await logsPrisma.notificationJobTracking.update({
    where: { job_id: jobId },
    data: {
      status: "dead",
      attempts,
      last_error: safeJson(error),
      processed_at: new Date(),
      next_retry_at: null,
    },
  });
}

// --- Point 3: DLQ alerting via WhatsApp (direct call, no queue) ---
async function sendDlqAlert(
  jobId: string,
  jobType: string,
  attempts: number,
  error: unknown,
): Promise<void> {
  // Skip alert in dry run mode — no real messages
  if (isDryRun()) {
    console.log(
      `[DLQ Alert - DRY RUN] Would alert for job ${jobId} (${jobType}), ${attempts} attempts`,
    );
    return;
  }

  try {
    const errorMsg =
      error instanceof Error ? error.message : safeJson(error);
    const truncatedError =
      errorMsg.length > 200 ? errorMsg.substring(0, 200) + "..." : errorMsg;

    const body =
      `[Netsight DLQ Alert]\n` +
      `Job: ${jobId}\n` +
      `Type: ${jobType}\n` +
      `Failed after ${attempts} attempts.\n` +
      `Error: ${truncatedError}`;

    // Direct Twilio call - NOT via RabbitMQ (avoids feedback loop)
    const twilio = await import("twilio");
    const client = twilio.default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM || "+19785889593";

    await client.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${cfg.dlqAlertPhone}`,
      body,
    });
  } catch (alertError) {
    // Alert failure must never crash the consumer
    console.error("[DLQ Alert] Failed to send WhatsApp alert:", alertError);
  }
}

// --- Point 2: Confirm channel for publisher confirms ---
async function setupChannel(): Promise<ConfirmChannel> {
  if (channel) return channel;
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    const conn = await amqp.connect(cfg.url);
    conn.on("error", (err) => {
      console.error("RabbitMQ connection error:", err);
    });

    conn.on("close", () => {
      channel = null;
      setupPromise = null;
      setTimeout(() => setupChannel(), 5000); // auto reconnect
    });

    // Use createConfirmChannel instead of createChannel
    const ch = await conn.createConfirmChannel();

    await ch.assertExchange(cfg.exchange, "direct", { durable: true });
    await ch.assertExchange(cfg.retryExchange, "direct", { durable: true });
    await ch.assertExchange(cfg.dlxExchange, "direct", { durable: true });

    await ch.assertQueue(cfg.queue, {
      durable: true,
    });
    await ch.assertQueue(cfg.retryQueue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": cfg.exchange,
        "x-dead-letter-routing-key": cfg.route,
      },
    });
    await ch.assertQueue(cfg.dlq, { durable: true });

    await ch.bindQueue(cfg.queue, cfg.exchange, cfg.route);
    await ch.bindQueue(cfg.retryQueue, cfg.retryExchange, cfg.retryRoute);
    await ch.bindQueue(cfg.dlq, cfg.dlxExchange, cfg.dlqRoute);
    await ch.prefetch(cfg.prefetch);

    channel = ch;
    return ch;
  })();

  return setupPromise;
}

// Helper: publish with broker confirmation (awaits ack from RabbitMQ)
function publishWithConfirm(
  ch: ConfirmChannel,
  exchange: string,
  routingKey: string,
  content: Buffer,
  options: amqp.Options.Publish,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ch.publish(exchange, routingKey, content, options, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function publishNotificationJob(
  type: NotificationJobType,
  payload: NotificationJobPayload,
): Promise<{ queued: boolean; jobId?: string; message?: string }> {
  if (!isRabbitEnabled()) {
    return { queued: false, message: "RabbitMQ disabled" };
  }

  const ch = await setupChannel();
  const job: NotificationJobMessage = {
    jobId: randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
  };

  try {
    await trackQueued(job);
  } catch (dbError) {
    console.error("DB tracking failed, aborting publish:", dbError);
    throw dbError;
  }

  // Await broker confirmation before returning success
  await publishWithConfirm(
    ch,
    cfg.exchange,
    cfg.route,
    Buffer.from(JSON.stringify(job), "utf-8"),
    {
      persistent: true,
      contentType: "application/json",
      headers: {
        "x-job-id": job.jobId,
        "x-attempts": 0,
      },
    },
  );

  return { queued: true, jobId: job.jobId };
}

async function processJob(job: NotificationJobMessage): Promise<unknown> {
  // --- DRY RUN MODE ---
  // Simulates job processing without calling real Twilio/Mailjet.
  // Set DRY_RUN_FAIL_RATE (0-100) to control what percentage of jobs fail.
  //   DRY_RUN_FAIL_RATE=100  → all fail (tests full retry → DLQ flow)
  //   DRY_RUN_FAIL_RATE=0    → all succeed (tests happy path throughput)
  //   DRY_RUN_FAIL_RATE=30   → 30% fail randomly (realistic mixed scenario)
  if (isDryRun()) {
    // Simulate processing time (50-300ms random)
    const delay = 50 + Math.floor(Math.random() * 250);
    await new Promise((resolve) => setTimeout(resolve, delay));

    const failRate = Number(process.env.DRY_RUN_FAIL_RATE ?? "100");
    const shouldFail = Math.random() * 100 < failRate;

    if (shouldFail) {
      console.log(
        `[DRY RUN] Simulated FAILURE for job ${job.jobId} (type: ${job.type})`,
      );
      throw new Error(`DRY RUN simulated failure (failRate=${failRate}%)`);
    }

    console.log(
      `[DRY RUN] Simulated SUCCESS for job ${job.jobId} (type: ${job.type})`,
    );
    return { ok: true, dryRun: true, jobId: job.jobId };
  }

  if (job.type === "whatsapp_send_media_twilio") {
    const p = job.payload as WhatsAppMediaQueuePayload;
    const res = await WhatsAppService.sendMediaTemplate(
      p.to,
      p.templateName,
      p.mediaValue,
      p.bodyVariables || {},
      p.fromCredentials,
      p.mediaVariableKey || "MediaUrl",
    );
    if (!res.ok) {
      const err = res.error ?? { message: "WhatsApp media send failed", status: 500 };
      const rateLimitDelay = extractRateLimitDelay(err);
      if (rateLimitDelay !== null) {
        throw new RateLimitError(err.message || "Twilio rate limit", rateLimitDelay);
      }
      throw err;
    }
    return res;
  }

  if (job.type === "whatsapp_send_message_twilio") {
    const p = job.payload as WhatsAppTemplateQueuePayload;
    const res = await WhatsAppService.sendTemplate(
      p.to,
      p.templateName,
      p.languageCode,
      p.components,
      p.fromCredentials,
    );
    if (!res.ok) {
      const err = res.error ?? {
        message: "WhatsApp send failed",
        status: 500,
      };
      // Check if it's a 429 from Twilio
      const rateLimitDelay = extractRateLimitDelay(err);
      if (rateLimitDelay !== null) {
        throw new RateLimitError(
          err.message || "Twilio rate limit",
          rateLimitDelay,
        );
      }
      throw err;
    }
    return res;
  }

  const p = job.payload as EmailDynamicQueuePayload;
  const res = await EmailService.sendEmail(
    p.to,
    p.subject,
    p.htmlContent,
    p.textContent,
    p.cc,
    p.bcc,
    p.attachments,
    p.logContext,
  );
  if (!res.ok) {
    const err = res.error ?? { message: "Email send failed", status: 500 };
    // Check if it's a 429 from Mailjet
    const rateLimitDelay = extractRateLimitDelay(err);
    if (rateLimitDelay !== null) {
      throw new RateLimitError(
        err.message || "Mailjet rate limit",
        rateLimitDelay,
      );
    }
    throw err;
  }
  return res;
}

function getRetryDelay(attempt: number): number {
  if (cfg.retryDelays.length === 0) return 5000;
  const idx = Math.max(0, Math.min(attempt - 1, cfg.retryDelays.length - 1));
  return cfg.retryDelays[idx];
}

export async function startNotificationConsumer(): Promise<void> {
  if (!isRabbitEnabled()) return;
  const ch = await setupChannel();

  await ch.consume(
    cfg.queue,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const raw = msg.content.toString("utf-8");
      const headers = (msg.properties.headers || {}) as Record<
        string,
        unknown
      >;
      const attempts = Number(headers["x-attempts"] ?? 0);

      let parsed: NotificationJobMessage | null = null;
      let alreadyAcked = false;

      try {
        parsed = JSON.parse(raw) as NotificationJobMessage;
        await trackProcessing(parsed.jobId, attempts);
        const response = await processJob(parsed);
        await trackSucceeded(parsed.jobId, attempts, response).catch((e) =>
          console.error("[Track] trackSucceeded failed:", e),
        );
      } catch (error) {
        if (!parsed) {
          // Unparseable message — ack and discard immediately
          ch.ack(msg);
          alreadyAcked = true;
          return;
        }

        // Determine max retries: 429 gets more chances
        const isRateLimit = error instanceof RateLimitError;
        const maxForThisJob = isRateLimit
          ? cfg.maxRetriesRateLimit
          : cfg.maxRetries;
        const nextAttempt = attempts + 1;

        try {
          if (nextAttempt <= maxForThisJob) {
            // Use Retry-After delay for 429, otherwise use fixed schedule
            const delayMs = isRateLimit
              ? (error as RateLimitError).retryAfterMs
              : getRetryDelay(nextAttempt);

            await trackRetry(parsed.jobId, nextAttempt, error, delayMs);
            ch.publish(
              cfg.retryExchange,
              cfg.retryRoute,
              Buffer.from(JSON.stringify(parsed), "utf-8"),
              {
                persistent: true,
                expiration: String(delayMs),
                headers: {
                  "x-job-id": parsed.jobId,
                  "x-attempts": nextAttempt,
                },
              },
            );
          } else {
            // Dead letter
            await trackDead(parsed.jobId, nextAttempt, error).catch((e) =>
              console.error("[Track] trackDead DB failed:", e),
            );
            ch.publish(
              cfg.dlxExchange,
              cfg.dlqRoute,
              Buffer.from(JSON.stringify(parsed), "utf-8"),
              {
                persistent: true,
                headers: {
                  "x-job-id": parsed.jobId,
                  "x-attempts": nextAttempt,
                },
              },
            );
            // Fire DLQ WhatsApp alert (non-blocking)
            sendDlqAlert(
              parsed.jobId,
              parsed.type,
              nextAttempt,
              error,
            ).catch(() => {});
          }
        } catch (retryError) {
          // If tracking/republish itself fails, log and continue
          console.error(
            "[Consumer] Retry/DLQ handling failed for job:",
            parsed.jobId,
            retryError,
          );
        }
      } finally {
        // CRITICAL: Always ack — prevents unacked message buildup
        // Guard against double-ack (when parsed was null)
        if (!alreadyAcked) {
          ch.ack(msg);
        }
      }
    },
    { noAck: false },
  );

  console.log(`RabbitMQ consumer started. queue=${cfg.queue}, dlq=${cfg.dlq}`);
}




