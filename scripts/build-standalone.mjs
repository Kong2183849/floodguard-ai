import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, 'public', 'data');
const TMP_OUT_DIR = path.join(ROOT_DIR, '.tmp-standalone-build');
const OUTPUT_HTML = path.join(ROOT_DIR, 'FloodGuard_AI.html');

const GEOJSON_FILES = [
  'boundary.geojson',
  'roads.geojson',
  'buildings.geojson',
  'water.geojson',
  'parks.geojson',
  'stations.geojson',
  'railways.geojson',
];

function escapeInlineScript(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

function escapeInlineStyle(css) {
  return css.replace(/<\/style/gi, '<\\/style');
}

function buildEmbeddedDatasetsPayload() {
  const embedded = {};
  let rawTotal = 0;
  let gzTotal = 0;

  for (const filename of GEOJSON_FILES) {
    const filePath = path.join(PUBLIC_DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required GeoJSON dataset: ${filePath}`);
    }
    const rawText = fs.readFileSync(filePath, 'utf8');
    // Minify JSON cleanly without altering any geometry or property values
    const minified = JSON.stringify(JSON.parse(rawText));
    const gzBuffer = zlib.gzipSync(Buffer.from(minified, 'utf8'), { level: 9 });
    const base64 = gzBuffer.toString('base64');

    rawTotal += Buffer.byteLength(rawText, 'utf8');
    gzTotal += base64.length;

    embedded[filename] = {
      encoding: 'gzip-base64',
      data: base64,
    };
  }

  console.log(
    `[standalone] Embedded ${GEOJSON_FILES.length} GeoJSON datasets: ${(rawTotal / 1024 / 1024).toFixed(2)} MB raw -> ${(gzTotal / 1024 / 1024).toFixed(2)} MB gzip-base64`
  );
  return embedded;
}

async function run() {
  process.env.NODE_ENV = 'production';

  if (fs.existsSync(TMP_OUT_DIR)) {
    fs.rmSync(TMP_OUT_DIR, { recursive: true, force: true });
  }

  console.log('[standalone] Building single-bundle IIFE JS + CSS via Vite (production mode)...');

  await build({
    root: ROOT_DIR,
    base: './',
    mode: 'production',
    configFile: false,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': ROOT_DIR,
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.BASE_URL': JSON.stringify('./'),
    },
    publicDir: false,
    build: {
      outDir: TMP_OUT_DIR,
      emptyOutDir: true,
      sourcemap: false,
      cssCodeSplit: false,
      assetsInlineLimit: 100 * 1024 * 1024,
      target: 'es2020',
      rollupOptions: {
        input: path.join(ROOT_DIR, 'src', 'main.tsx'),
        output: {
          format: 'iife',
          name: 'FloodGuardAIApp',
          codeSplitting: false,
          entryFileNames: 'bundle.js',
          assetFileNames: 'bundle.[ext]',
        },
      },
    },
  });

  const outFiles = fs.readdirSync(TMP_OUT_DIR);
  const jsFiles = outFiles.filter((f) => f.endsWith('.js'));
  const cssFiles = outFiles.filter((f) => f.endsWith('.css'));

  if (jsFiles.length !== 1) {
    throw new Error(`Expected exactly 1 JS bundle, found: ${jsFiles.join(', ')}`);
  }

  const jsCode = fs.readFileSync(path.join(TMP_OUT_DIR, jsFiles[0]), 'utf8');
  const cssCode = cssFiles
    .map((f) => fs.readFileSync(path.join(TMP_OUT_DIR, f), 'utf8'))
    .join('\n');

  const embeddedDatasets = buildEmbeddedDatasetsPayload();

  // Offline-ready system + Thai font stack fallback (no external Google Fonts network requests)
  const offlineFontOverrideCss = `
:root {
  --font-sans: "Plus Jakarta Sans", "Noto Sans Thai", "Segoe UI", "Leelawadee UI", Tahoma, -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", Consolas, "Liberation Mono", ui-monospace, SFMono-Regular, monospace;
}
`;

  const html = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FloodGuard AI — AI-Powered Smart Flood Management &amp; Decision Support System</title>
    <meta
      name="description"
      content="FloodGuard AI — Standalone Offline Smart Flood Management, Chatuchak 3D Urban Infrastructure Simulation, and Intelligent Route Optimization."
    />
    <script>
      (function () {
        window.__FLOODGUARD_STANDALONE__ = true;
        try {
          var stored = window.localStorage.getItem('urbanguard-theme');
          var mode = stored === 'light' ? 'light' : 'dark';
          var root = document.documentElement;
          root.classList.toggle('dark', mode === 'dark');
          root.classList.toggle('light', mode === 'light');
          root.style.colorScheme = mode;
        } catch (e) {}
      })();
    </script>
    <style>
${escapeInlineStyle(cssCode)}
${offlineFontOverrideCss}
    </style>
  </head>
  <body class="bg-[#F4F7FB] text-[#172033] dark:bg-[#060b14] dark:text-slate-100 antialiased selection:bg-cyan-500/25 selection:text-cyan-950 dark:selection:text-cyan-100">
    <div id="root"></div>
    <script>
      window.__FLOODGUARD_EMBEDDED_DATASETS__ = ${escapeInlineScript(JSON.stringify(embeddedDatasets))};
    </script>
    <script>
${escapeInlineScript(jsCode)}
    </script>
  </body>
</html>
`;

  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  fs.rmSync(TMP_OUT_DIR, { recursive: true, force: true });

  const stats = fs.statSync(OUTPUT_HTML);
  console.log(
    `[standalone] Generated ${OUTPUT_HTML} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
  );
}

run().catch((err) => {
  console.error('[standalone] Build failed:', err);
  process.exit(1);
});
