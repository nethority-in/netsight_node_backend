// Renders template HTML into a PNG image or PDF using Puppeteer.
// - PNG: full-page screenshot, compressed with sharp to stay under 5MB (WhatsApp image limit)
// - PDF: A4 pages, kept under 16MB (WhatsApp document limit)
// Files are written to a public folder and a public URL is returned.

import puppeteer, { Browser } from 'puppeteer';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import logger from '../config/logger.js';

const WHATSAPP_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const WHATSAPP_PDF_MAX_BYTES = 16 * 1024 * 1024; // 16MB

// Render width tuned for the 600px email container (2x for retina sharpness)
const RENDER_WIDTH = 640;
const DEVICE_SCALE = 2;

// Public folder + base URL for generated media
const MEDIA_DIR = process.env.MEDIA_STORAGE_DIR || path.resolve(process.cwd(), 'public', 'reports');
const MEDIA_PUBLIC_BASE = (process.env.MEDIA_PUBLIC_BASE_URL || 'http://localhost:3002/reports').replace(/\/+$/, '');

// Reuse a single browser instance across requests (faster, less memory churn)
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    // Reset on disconnect so it relaunches next time
    browserPromise.then((b) => {
      b.on('disconnected', () => {
        browserPromise = null;
      });
    }).catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

async function ensureMediaDir(): Promise<void> {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
}

export interface RenderResult {
  ok: boolean;
  publicUrl?: string;
  filePath?: string;
  fileName?: string;
  bytes?: number;
  error?: string;
}

// Render HTML into a PNG. Compresses to stay under 5MB.
export async function renderHtmlToImage(html: string): Promise<RenderResult> {
  let page;
  try {
    await ensureMediaDir();
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: RENDER_WIDTH, height: 800, deviceScaleFactor: DEVICE_SCALE });
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    // Give web fonts/remote logo images a moment to settle
    await new Promise((r) => setTimeout(r, 400));

    // Full-page PNG buffer
    const rawPng = (await page.screenshot({ type: 'png', fullPage: true })) as Buffer;

    // Compress with sharp — start high quality, downscale if over 5MB
    let output = await sharp(rawPng).png({ compressionLevel: 9, quality: 90 }).toBuffer();

    if (output.length > WHATSAPP_IMAGE_MAX_BYTES) {
      // Fall back to JPEG (much smaller) and progressively lower quality
      let quality = 85;
      const meta = await sharp(rawPng).metadata();
      const targetWidth = meta.width ? Math.min(meta.width, 1080) : 1080;
      do {
        output = await sharp(rawPng)
          .resize({ width: targetWidth })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        quality -= 10;
      } while (output.length > WHATSAPP_IMAGE_MAX_BYTES && quality >= 40);
    }

    const isJpeg = output[0] === 0xff && output[1] === 0xd8;
    const ext = isJpeg ? 'jpg' : 'png';
    const fileName = `report-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const filePath = path.join(MEDIA_DIR, fileName);
    await fs.writeFile(filePath, output);

    const publicUrl = `${MEDIA_PUBLIC_BASE}/${fileName}`;
    logger.info('Report image rendered', { fileName, bytes: output.length, publicUrl });

    return { ok: true, publicUrl, filePath, fileName, bytes: output.length };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('renderHtmlToImage failed', { error: msg });
    return { ok: false, error: msg };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// Render HTML into a PDF. Kept under 16MB.
export async function renderHtmlToPdf(html: string): Promise<RenderResult> {
  let page;
  try {
    await ensureMediaDir();
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: RENDER_WIDTH, height: 800, deviceScaleFactor: DEVICE_SCALE });
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    // Give web fonts/remote logo images a moment to settle
    await new Promise((r) => setTimeout(r, 400));

    const pdfBuffer = (await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12px', bottom: '12px', left: '12px', right: '12px' },
    })) as Buffer;

    if (pdfBuffer.length > WHATSAPP_PDF_MAX_BYTES) {
      return {
        ok: false,
        error: `Generated PDF (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB) exceeds WhatsApp 16MB limit.`,
      };
    }

    const fileName = `report-${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
    const filePath = path.join(MEDIA_DIR, fileName);
    await fs.writeFile(filePath, pdfBuffer);

    const publicUrl = `${MEDIA_PUBLIC_BASE}/${fileName}`;
    logger.info('Report PDF rendered', { fileName, bytes: pdfBuffer.length, publicUrl });

    return { ok: true, publicUrl, filePath, fileName, bytes: pdfBuffer.length };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('renderHtmlToPdf failed', { error: msg });
    return { ok: false, error: msg };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

