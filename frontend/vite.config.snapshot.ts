import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/** Thứ tự load snapshot data — phải khớp export_demo_snapshot.py */
const SNAPSHOT_DATA_FILES = [
  "manifest.js",
  "auth.js",
  "warehouses.js",
  "zones.js",
  "locations.js",
  "items.js",
  "qrcodes.js",
  "units.js",
  "inbound.js",
  "outbound.js",
  "stocktake.js",
  "itemstocks.js",
  "transactions.js",
  "misc.js",
];

/**
 * Post-process index.html cho file://:
 * - Bỏ type="module" và crossorigin (Chrome/Edge chặn ES module trên file://)
 * - Chèn config + data snapshot trước bundle IIFE
 */
function snapshotHtmlPlugin(): Plugin {
  return {
    name: "snapshot-html",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const scripts = [
          `<script src="./config.js"></script>`,
          ...SNAPSHOT_DATA_FILES.map(
            (file) => `<script src="./data/${file}"></script>`,
          ),
          `<script src="./assets/app.js"></script>`,
        ].join("\n    ");

        let out = html
          .replace(/\s*<script type="module"[^>]*><\/script>/i, "")
          .replace(/\s*<link rel="stylesheet" crossorigin[^>]*>/i, "")
          .replace(/\s*<link rel="stylesheet" href="\.\/assets\/[^"]+\.css"[^>]*>/i, "");

        // CSS trong head; script cuối body de #root da ton tai khi React mount.
        out = out.replace(
          "</head>",
          `    <link rel="stylesheet" href="./assets/style.css">\n  </head>`,
        );
        out = out.replace("</body>", `    ${scripts}\n  </body>`);
        return out;
      },
    },
  };
}

export default defineConfig({
  mode: "snapshot",
  envDir: ".",
  plugins: [react(), tailwindcss(), snapshotHtmlPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "../../HTML"),
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // IIFE + 1 file: chạy được khi double-click index.html (file://).
        format: "iife",
        inlineDynamicImports: true,
        name: "WmsDemoApp",
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
