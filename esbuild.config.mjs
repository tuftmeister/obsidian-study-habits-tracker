import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// In dev mode, output directly into the test vault so Hot Reload picks it up.
// In production mode, output to the project root for packaging.
const outdir = prod
  ? "."
  : "test/.obsidian/plugins/study-habits-tracker";

// Ensure the output directory exists
fs.mkdirSync(outdir, { recursive: true });

// Copy static plugin files into the vault plugin dir (dev mode only)
function copyStaticFiles() {
  if (!prod) {
    fs.copyFileSync("manifest.json", path.join(outdir, "manifest.json"));
    fs.copyFileSync("styles.css", path.join(outdir, "styles.css"));
    // Create .hotreload marker for Hot Reload plugin
    const hotreload = path.join(outdir, ".hotreload");
    if (!fs.existsSync(hotreload)) fs.writeFileSync(hotreload, "");
  }
}

copyStaticFiles();

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: path.join(outdir, "main.js"),
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
