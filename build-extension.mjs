import * as esbuild from "esbuild";
import { copyToAppPlugin, copyManifestPlugin, commonConfig } from "./build.helpers.mjs";
import parseArgs from "minimist";

const outDir = `dist/BGS-UtilityTools`;
const appDir = "C:\\Users\\ThomHopstaekn\\Mendix\\BGS - Tracks-Branch_TestExtension";
const extensionDirectoryName = "extensions";

const entryPoints = [
  {
    in: "src/main.ts",
    out: "main",
  },
];

entryPoints.push({
  in: "src/EntityNameChanger/main.ts",
  out: "dockablepane",
});

const args = parseArgs(process.argv.slice(2));
const buildContext = await esbuild.context({
  ...commonConfig,
  loader: {
    ...(commonConfig.loader ?? {}),
    ".css": "text",
    ".html": "text",
    ".svg": "text",
  },
  outdir: outDir,
  plugins: [copyManifestPlugin(outDir), copyToAppPlugin(appDir, outDir, extensionDirectoryName)],
  entryPoints,
});

if ("watch" in args) {
  await buildContext.watch();
} else {
  await buildContext.rebuild();
  await buildContext.dispose();
}
