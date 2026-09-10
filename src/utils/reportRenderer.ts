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
    browserPromise.then((b) => {
      b.on('disconnected', () => { browserPromise = null; });
    }).catch(() => { browserPromise = null; });
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

// Build an industry-standard, safe file name.
// e.g. "Netsights-Report_Celebrity-Drapes_2026-09-10_a1b2c3d4.pdf"
function buildFileName(ext: string, hint?: string): string {
  const datePart = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const shortId = randomUUID().slice(0, 8);
  let slug = 'Report';
  if (hint && hint.trim()) {
    slug = hint.trim()
      .replace(/[^a-zA-Z0-9\s-]/g, '') // drop unsafe chars
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40) || 'Report';
  }
  return `Netsights-Report_${slug}_${datePart}_${shortId}.${ext}`;
}

// Shared: repeating per-page header (logo + green line) and footer (copyright,
// support links, page number). Uses Puppeteer displayHeaderFooter templates.
function buildHeaderTemplate(): string {
  return `
    <div style="width:100%; -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:0 12px; box-sizing:border-box;">
      <div style="text-align:center; padding:6px 0 8px 0; border-bottom:3px solid #5DBBB8;">
        <img src="https://app.netsights.ai/images/logo/netsight-Black.svg" style="height:26px;" />
      </div>
    </div>
  `;
}

function buildFooterTemplate(): string {
  // Puppeteer injects .pageNumber / .totalPages spans automatically.
  return `
    <div style="width:100%; font-family:Arial,Helvetica,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:0 12px; box-sizing:border-box;">
      <div style="border-top:1px solid #e5e7eb; padding-top:6px; text-align:center; color:#6b7280; font-size:9px; line-height:1.5;">
        <div>&copy; ${new Date().getFullYear()} Netsights.ai. All rights reserved</div>
        <div style="margin-top:2px;">
          <a href="https://netsights.ai/support/" style="color:#5DBBB8; text-decoration:none;">Support</a>
          &nbsp;|&nbsp;
          <a href="https://netsights.ai/contact-us/" style="color:#5DBBB8; text-decoration:none;">Contact Us</a>
        </div>
        <div style="margin-top:2px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
      </div>
    </div>
  `;
}

// Render HTML into a PNG. Compresses to stay under 5MB.
export async function renderHtmlToImage(html: string, fileNameHint?: string): Promise<RenderResult> {
  let page;
  try {
    await ensureMediaDir();
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: RENDER_WIDTH, height: 800, deviceScaleFactor: DEVICE_SCALE });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 400));

    const rawPng = (await page.screenshot({ type: 'png', fullPage: true })) as Buffer;

    let output = await sharp(rawPng).png({ compressionLevel: 9, quality: 90 }).toBuffer();
    if (output.length > WHATSAPP_IMAGE_MAX_BYTES) {
      let quality = 85;
      const meta = await sharp(rawPng).metadata();
      const targetWidth = meta.width ? Math.min(meta.width, 1080) : 1080;
      do {
        output = await sharp(rawPng).resize({ width: targetWidth }).jpeg({ quality, mozjpeg: true }).toBuffer();
        quality -= 10;
      } while (output.length > WHATSAPP_IMAGE_MAX_BYTES && quality >= 40);
    }

    const isJpeg = output[0] === 0xff && output[1] === 0xd8;
    const ext = isJpeg ? 'jpg' : 'png';
    const fileName = buildFileName(ext, fileNameHint);
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
export async function renderHtmlToPdf(html: string, fileNameHint?: string): Promise<RenderResult> {
  let page;
  try {
    await ensureMediaDir();
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: RENDER_WIDTH, height: 800, deviceScaleFactor: DEVICE_SCALE });
    // Always render light (never trigger the template dark-mode CSS).
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    // Print CSS:
    // - Small boxes (.highlight/.review/.inventory) keep their SINGLE box and jump whole.
    // - Big ".layer" sections split across pages via the table<thead> trick (header repeats),
    //   with cells carrying the box so each page fragment closes/reopens cleanly.
    // - The in-body header + in-body footer are hidden (we use repeating PDF header/footer).
    const printCss = `
      <style>
        @media print {
          /* small boxes: single box, never split */
          .highlight, .review, .inventory { break-inside: avoid; page-break-inside: avoid; }
          /* one ad-account row: keep together */
          .metrics-table { break-inside: avoid; page-break-inside: avoid; }
          /* big sections: allow split */
          .layer { break-inside: auto; page-break-inside: auto; }
          /* hide in-body header (repeating PDF header used instead) */
          .header { display: none !important; }
          /* footer: keep the CTA button, drop its bg/border. Copyright + links
             are removed in the DOM transform (they live in the PDF footer now). */
          .footer { background: transparent !important; border-top: none !important; padding-top: 4px !important; }
        }
        /* Split .layer -> table; outer box styling removed, table cells carry the box. */
        .layer.is-split { background:transparent !important; border:none !important; padding:0 !important; border-radius:0 !important; }
        /* separate (not collapse) so border-radius on cells is respected */
        table.layer-split { width:100%; border-collapse:separate; border-spacing:0; }
        table.layer-split thead { display: table-header-group; }
        /* Header cell = top of the box: rounded TOP corners + top/left/right border accent */
        table.layer-split .layer-header-cell {
          padding: 15px 15px 8px 15px;
          border-top-left-radius: 14px; border-top-right-radius: 14px;
          border-left: 4px solid #6366f1;
        }
        /* Body cells = middle of the box: left border only */
        table.layer-split .layer-body-cell {
          padding: 0 15px 0 15px;
          border-left: 4px solid #6366f1;
          break-inside: avoid; page-break-inside: avoid;
        }
        /* Last body cell = bottom of the box: rounded BOTTOM corners + bottom padding */
        table.layer-split tbody tr:last-child .layer-body-cell {
          padding-bottom: 15px;
          border-bottom-left-radius: 14px; border-bottom-right-radius: 14px;
        }
        table.layer-split.teal   .layer-header-cell, table.layer-split.teal   .layer-body-cell { background:#ecfeff; border-left-color:#5eead4; }
        table.layer-split.pink   .layer-header-cell, table.layer-split.pink   .layer-body-cell { background:#fdf2f8; border-left-color:#f9a8d4; }
        table.layer-split.indigo .layer-header-cell, table.layer-split.indigo .layer-body-cell { background:#eef2ff; border-left-color:#c7d2fe; }
        a.footer-btn-link:hover, a[href*="netsights.ai"]:hover { background-color:#4da9a6 !important; color:#ffffff !important; }
      </style>
    `;
    const htmlForPdf = html.includes('</head>') ? html.replace('</head>', printCss + '</head>') : printCss + html;
    await page.setContent(htmlForPdf, { waitUntil: 'load', timeout: 30000 });

    // Transform ONLY big ".layer" sections into a header-repeating table.
    // Small boxes (.highlight/.review/.inventory) are left untouched -> single clean box.
    const transformFn = `() => {
      var layers = document.querySelectorAll('.layer');
      layers.forEach(function (layer) {
        var header = layer.querySelector('.layer-header');
        if (!header) return;
        var variant = layer.classList.contains('teal') ? 'teal'
                    : layer.classList.contains('pink') ? 'pink'
                    : layer.classList.contains('indigo') ? 'indigo' : '';
        // Flatten ad-account wrapper divs so each account becomes its own row.
        var blocks = [];
        layer.childNodes.forEach(function (n) {
          if (n === header) return;
          if (n.nodeType === 3 && !String(n.textContent).trim()) return;
          if (n.nodeType === 1 && n.tagName === 'DIV' && n.querySelector && n.querySelector('.layer-header')) {
            n.childNodes.forEach(function (c) {
              if (c.nodeType === 3 && !String(c.textContent).trim()) return;
              blocks.push(c);
            });
          } else {
            blocks.push(n);
          }
        });
        var table = document.createElement('table');
        table.className = 'layer-split' + (variant ? ' ' + variant : '');
        var thead = document.createElement('thead');
        var htr = document.createElement('tr');
        var hcell = document.createElement('td');
        hcell.className = 'layer-header-cell';
        hcell.appendChild(header.cloneNode(true));
        htr.appendChild(hcell);
        thead.appendChild(htr);
        var tbody = document.createElement('tbody');
        blocks.forEach(function (n) {
          var btr = document.createElement('tr');
          var bcell = document.createElement('td');
          bcell.className = 'layer-body-cell';
          bcell.appendChild(n);
          btr.appendChild(bcell);
          tbody.appendChild(btr);
        });
        table.appendChild(thead);
        table.appendChild(tbody);
        header.remove();
        layer.classList.add('is-split');
        layer.appendChild(table);
      });

      // Footer cleanup: keep the CTA button table, remove the copyright <p> and
      // the Support|Contact links table (those are shown in the repeating PDF footer).
      var footer = document.querySelector('.footer');
      if (footer) {
        // remove copyright paragraph(s)
        footer.querySelectorAll('p').forEach(function (p) { p.remove(); });
        // remove the LAST table (support|contact links); keep the first (buttons)
        var tables = footer.querySelectorAll('table');
        if (tables.length > 1) {
          tables[tables.length - 1].remove();
        }
      }
    }`;
    await (page as any).evaluate(`(${transformFn})()`);

    await new Promise((r) => setTimeout(r, 400));

    const pdfBuffer = (await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(),
      footerTemplate: buildFooterTemplate(),
      // Room for repeating header (top) and footer (bottom).
      margin: { top: '70px', bottom: '60px', left: '12px', right: '12px' },
    })) as Buffer;

    if (pdfBuffer.length > WHATSAPP_PDF_MAX_BYTES) {
      return { ok: false, error: `Generated PDF (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB) exceeds WhatsApp 16MB limit.` };
    }

    const fileName = buildFileName('pdf', fileNameHint);
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




