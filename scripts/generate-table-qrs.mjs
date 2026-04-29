// Run first: npm install qrcode --save-dev
// Usage:    node scripts/generate-table-qrs.mjs
// Env vars: BASE_URL (default https://example.com), TABLE_COUNT (default 20)

import QRCode from "qrcode";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.BASE_URL ?? "https://example.com";
const TABLE_COUNT = parseInt(process.env.TABLE_COUNT ?? "20", 10);

async function main() {
  const cells = await Promise.all(
    Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map(async (n) => {
      const url = `${BASE_URL}/?t=${n}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 2 });
      return { n, url, dataUrl };
    })
  );

  const cellsHtml = cells
    .map(
      ({ n, url, dataUrl }) => `
    <div class="cell">
      <div class="table-num">Table ${n}</div>
      <img src="${dataUrl}" alt="QR for table ${n}" />
      <div class="url">${url}</div>
    </div>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Upper Deck — Table QR Codes</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: sans-serif;
      background: #fff;
      padding: 16px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      border: 2px solid #1f2e26;
      padding: 12px 8px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .table-num {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #1f2e26;
      text-transform: uppercase;
    }

    img {
      width: 120px;
      height: 120px;
    }

    .url {
      font-size: 8px;
      color: #555;
      word-break: break-all;
      text-align: center;
    }

    @media print {
      body { padding: 0; }
      .grid { gap: 8px; }
    }
  </style>
</head>
<body>
  <div class="grid">
    ${cellsHtml}
  </div>
</body>
</html>`;

  const outPath = resolve(__dirname, "qrs.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`Generated ${TABLE_COUNT} QR codes → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
