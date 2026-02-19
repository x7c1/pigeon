import { cpSync } from "node:fs";
import * as esbuild from "esbuild";

const entryPoints = ["src/background.ts", "src/content.ts", "src/popup.ts"];

await esbuild.build({
  entryPoints,
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  minify: false,
});

// Copy static files to dist/
const staticFiles = [
  "manifest.json",
  "popup.html",
  "icon48.png",
  "icon128.png",
];
for (const file of staticFiles) {
  cpSync(file, `dist/${file}`);
}
