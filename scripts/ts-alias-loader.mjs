import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') {
      return nextResolve(pathToFileURL(path.join(projectRoot, 'scripts', 'next-server-shim.mjs')).href, context);
    }
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const parentPath = context.parentURL?.startsWith('file:') ? path.dirname(fileURLToPath(context.parentURL)) : projectRoot;
      const base = path.resolve(parentPath, specifier);
      const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts')];
      const match = candidates.find(candidate => existsSync(candidate));
      if (match) return nextResolve(pathToFileURL(match).href, context);
    }
    if (specifier.startsWith('@/')) {
      const base = path.resolve(projectRoot, specifier.slice(2));
      const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
      const match = candidates.find(candidate => existsSync(candidate));
      if (!match) throw new Error(`Cannot resolve project alias ${specifier}`);
      return nextResolve(pathToFileURL(match).href, context);
    }
    return nextResolve(specifier, context);
  },
});
