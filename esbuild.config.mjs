import esbuild from "esbuild";
import process from "process";
import { existsSync, mkdirSync, copyFileSync } from "fs";

const vault = process.env.OBSIDIAN_VAULT;

if (!vault) {
  throw new Error(
    "OBSIDIAN_VAULT is not set. Set it to your Obsidian vault path."
  );
}

const outputDir =
  `${vault}/.obsidian/plugins/obsidian-figure-captions`;

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const isWatch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["main.ts"],

  bundle: true,

  external: [
    "obsidian",

    // IMPORTANT:
    // Obsidian provides these itself.
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
    "@lezer/lr"
  ],

  format: "cjs",
  platform: "node",
  target: "es2018",

  sourcemap: "inline",

  outfile: `${outputDir}/main.js`,

  logLevel: "info"
});

copyFileSync(
  "manifest.json",
  `${outputDir}/manifest.json`
);

copyFileSync(
  "styles.css",
  `${outputDir}/styles.css`
);

if (isWatch) {
  await context.watch();

  console.log(
    "Figure Captions: watching for changes..."
  );
} else {
  await context.rebuild();
  await context.dispose();
}
