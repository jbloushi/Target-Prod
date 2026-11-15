/**
 * Generates the branded Target Logistics Client API Documentation PDF
 * from docs/branding/Target_Logistics_Client_API_Documentation.html.
 *
 * Embeds local PNG brand assets as base64 data URIs directly inside the HTML
 * so it is 100% self-contained, then prints to A4 PDF via headless Chrome/Edge.
 *
 * Usage:
 *   node scripts/generate-api-docs-pdf.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const HTML_PATH = path.join(ROOT_DIR, 'docs', 'branding', 'Target_Logistics_Client_API_Documentation.html');
const PDF_TARGETS = [
  path.join(ROOT_DIR, 'Target_Logistics_Client_API_Documentation.pdf'),
  path.join(ROOT_DIR, 'docs', 'Target_Logistics_Client_API_Documentation.pdf'),
  path.join(ROOT_DIR, 'frontend', 'public', 'Target_Logistics_Client_API_Documentation.pdf'),
];

const ASSET_FILES = {
  'target-logo@2x.png': path.join(ROOT_DIR, 'frontend', 'public', 'images', 'target-logo@2x.png'),
  'target-logo-white@2x.png': path.join(ROOT_DIR, 'frontend', 'public', 'images', 'target-logo-white@2x.png'),
  'target-icon-white.png': path.join(ROOT_DIR, 'frontend', 'public', 'images', 'target-icon-white.png'),
  'pattern-triangle-cluster.png': path.join(ROOT_DIR, 'docs', 'branding', 'Brand guidelines', 'assets', 'pattern-triangle-cluster.png'),
  'doodle-light.png': path.join(ROOT_DIR, 'docs', 'branding', 'Brand guidelines', 'assets', 'doodle-light.png'),
};

function toDataUri(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing brand asset: ${filePath}`);
  }
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
  const b64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

function embedAssetsInHtml() {
  const dataUris = {};
  for (const [name, fullPath] of Object.entries(ASSET_FILES)) {
    dataUris[name] = toDataUri(fullPath);
  }

  let html = fs.readFileSync(HTML_PATH, 'utf8');

  // 1. Replace CSS custom property block idempotently
  const cssMarkerRegex = /\/\* BRAND-ASSETS-CSS-START \*\/[\s\S]*?\/\* BRAND-ASSETS-CSS-END \*\//;
  if (!cssMarkerRegex.test(html)) {
    throw new Error('Could not find BRAND-ASSETS-CSS markers in HTML template.');
  }
  const cssReplacement = [
    '/* BRAND-ASSETS-CSS-START */',
    `      --asset-triangle-cluster: url('${dataUris['pattern-triangle-cluster.png']}');`,
    `      --asset-doodle-light: url('${dataUris['doodle-light.png']}');`,
    '      /* BRAND-ASSETS-CSS-END */',
  ].join('\n');
  html = html.replace(cssMarkerRegex, cssReplacement);

  // 2. Replace <img data-brand-asset="..." src="..."> idempotently
  html = html.replace(
    /(<img\b[^>]*\bdata-brand-asset="([^"]+)"[^>]*\bsrc=")([^"]*)(")/g,
    (match, prefix, assetKey, _oldSrc, suffix) => {
      if (!dataUris[assetKey]) {
        throw new Error(`Unknown brand asset referenced in HTML: ${assetKey}`);
      }
      return `${prefix}${dataUris[assetKey]}${suffix}`;
    },
  );

  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log(`Embedded ${Object.keys(dataUris).length} brand assets into ${path.relative(ROOT_DIR, HTML_PATH)}`);
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('No Chromium-based browser (Chrome or Edge) found.');
}

async function renderPdfViaCdp(browserPath, htmlFileUrl, outPdfPath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-pdf-chrome-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];

  const proc = spawn(browserPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let stderrBuf = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for DevTools URL. stderr: ${stderrBuf}`)), 15000);

    const onData = (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    };

    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Browser exited early with code ${code}. stderr: ${stderrBuf}`));
    });
  });

  try {
    // Get page target via HTTP JSON endpoint
    const parsed = new URL(wsUrl);
    const listRes = await fetch(`http://${parsed.host}/json/list`);
    const targets = await listRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error('No DevTools page target found.');
    }

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    let msgId = 1;
    const pending = new Map();
    const events = [];

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      } else if (msg.method) {
        events.push(msg);
      }
    });

    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });

    await send('Page.enable');
    await send('Runtime.enable');

    const loadDone = new Promise((resolve) => {
      const handler = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', handler);
          resolve();
        }
      };
      ws.addEventListener('message', handler);
    });

    await send('Page.navigate', { url: htmlFileUrl });
    await loadDone;

    // Wait for Google Fonts (best-effort, capped at 5s) + all embedded images
    await send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `
        Promise.race([
          (async () => {
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            await Promise.all(Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
            await new Promise(r => setTimeout(r, 350));
          })(),
          new Promise(r => setTimeout(r, 5000))
        ])
      `,
    });

    const { data } = await send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });

    fs.writeFileSync(outPdfPath, Buffer.from(data, 'base64'));
    ws.close();
  } finally {
    try { proc.kill(); } catch {}
    setTimeout(() => {
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }, 300);
  }
}

async function renderPdfViaCliFallback(browserPath, htmlFileUrl, outPdfPath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-pdf-cli-'));
  try {
    await new Promise((resolve, reject) => {
      const args = [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-pdf-header-footer',
        '--allow-file-access-from-files',
        `--user-data-dir=${userDataDir}`,
        `--print-to-pdf=${outPdfPath}`,
        htmlFileUrl,
      ];
      const proc = spawn(browserPath, args, { stdio: 'inherit' });
      proc.on('exit', (code) => {
        if (code === 0 && fs.existsSync(outPdfPath)) resolve();
        else reject(new Error(`Browser CLI exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  } finally {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  embedAssetsInHtml();

  const browserPath = findBrowserExecutable();
  console.log(`Using headless browser: ${browserPath}`);

  const htmlFileUrl = pathToFileURL(HTML_PATH).href;
  const primaryOut = PDF_TARGETS[0];

  try {
    await renderPdfViaCdp(browserPath, htmlFileUrl, primaryOut);
  } catch (cdpErr) {
    console.warn(`CDP printToPDF failed (${cdpErr.message}); falling back to --print-to-pdf CLI.`);
    await renderPdfViaCliFallback(browserPath, htmlFileUrl, primaryOut);
  }

  for (const target of PDF_TARGETS.slice(1)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(primaryOut, target);
  }

  const sizeKb = (fs.statSync(primaryOut).size / 1024).toFixed(1);
  for (const target of PDF_TARGETS) {
    console.log(`Generated: ${path.relative(ROOT_DIR, target)} (${sizeKb} KB)`);
  }
}

main().catch((err) => {
  console.error('PDF generation failed:', err);
  process.exit(1);
});
