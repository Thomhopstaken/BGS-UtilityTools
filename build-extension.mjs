import * as esbuild from "esbuild";
import {
  copyToAppPlugin,
  copyManifestPlugin,
  commonConfig,
} from "./build.helpers.mjs";
import parseArgs from "minimist";

const outDir = `dist/BGS-UtilityTools`;
const appDir = "C:\\Users\\Thom\\Mendix\\TestApp-TestApp-BGS-UtilityTools";
const extensionDirectoryName = "extensions";

const entryPoints = [
  {
    in: "src/main.ts",
    out: "main",
  },
];

entryPoints.push({
  in: "src/EntityNameChanger/ui/index.ts",
  out: "dockablepane",
});

const args = parseArgs(process.argv.slice(2));
const buildContext = await esbuild.context({
  ...commonConfig,
  loader: {
    ...(commonConfig.loader ?? {}),
    ".css": "text",
    ".html": "text",
  },
  outdir: outDir,
  plugins: [
    copyManifestPlugin(outDir),
    copyToAppPlugin(appDir, outDir, extensionDirectoryName),
  ],
  entryPoints,
});

if ("watch" in args) {
  await buildContext.watch();
} else {
  await buildContext.rebuild();
  await buildContext.dispose();
}
