// @ts-check
import { transform } from '@swc/core';
import { build, context } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bundles apps/api into a single runnable dist/apps/api/main.js.
 *
 * A bundler, not plain `tsc`, because @sdp/contracts ships raw TypeScript
 * with no build step of its own (its package.json "main"/"exports" point
 * directly at src/index.ts - see the ADR-0014 investigation). Plain Node
 * cannot `require()` unparsed TypeScript, and `allowImportingTsExtensions`
 * (needed to typecheck the package at all) forbids `tsc` from emitting
 * runnable JS in the first place.
 *
 * esbuild alone is NOT enough, though it looks like it should be: esbuild
 * accepts `emitDecoratorMetadata` in tsconfig without erroring, but as of
 * 0.28.2 it silently never emits `design:paramtypes` for a class's
 * CONSTRUCTOR - verified directly with `esbuild.transformSync()` on a
 * two-line `@Injectable() class Foo { constructor(private bar: Bar) {} }`
 * repro, which produced no metadata call at all. Nest's DI reads exactly
 * that metadata to resolve constructor-injected providers, so every
 * provider silently landed `undefined` in a running build even though the
 * app started and routed requests without error - a fail-open, not a crash.
 * `@swc/core` implements this correctly (also verified directly), so it
 * does the TS-to-JS transform here; esbuild still does the resolution and
 * bundling, including inlining @sdp/contracts.
 */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(dirname, 'package.json'), 'utf8'));

// Real npm dependencies stay external and resolve from node_modules at
// runtime, same as any Node backend. @sdp/* workspace packages are
// deliberately left OUT of this list so esbuild bundles them inline.
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@sdp/'));

const outfile = path.join(dirname, '../../dist/apps/api/main.js');

/** @type {import('esbuild').Plugin} */
const swcPlugin = {
  name: 'swc',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /\.tsx?$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      const result = await transform(source, {
        filename: args.path,
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
          keepClassNames: true,
        },
        module: { type: 'es6' },
        sourceMaps: false,
      });
      return { contents: result.code, loader: 'js' };
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(dirname, 'src/main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  // ESM, matching every other package.json in the workspace ("type":
  // "module"). dist/apps/api has no package.json of its own, so Node
  // resolves module format from the nearest one upward - the repo root's,
  // which is ESM. A CJS `format` here would be misinterpreted as ESM at
  // runtime ("require is not defined in ES module scope") the moment Node
  // walks up to that root package.json.
  format: 'esm',
  sourcemap: true,
  external,
  plugins: [swcPlugin],
  // Only used for module RESOLUTION (paths, extensions) - the swc plugin
  // above replaces esbuild's own TS transform entirely, so decorator-related
  // compiler options here would be inert.
  tsconfig: path.join(dirname, 'tsconfig.app.json'),
};

const watch = process.argv.includes('--watch');

if (!watch) {
  await build(options);
} else {
  /** Restarts `node dist/apps/api/main.js` after every successful rebuild. */
  let child;
  const devServerPlugin = {
    name: 'dev-server',
    setup(pluginBuild) {
      pluginBuild.onEnd((result) => {
        if (result.errors.length > 0) return;
        child?.kill();
        child = spawn(process.execPath, [outfile], { stdio: 'inherit' });
      });
    },
  };

  const ctx = await context({ ...options, plugins: [swcPlugin, devServerPlugin] });
  await ctx.watch();
}
