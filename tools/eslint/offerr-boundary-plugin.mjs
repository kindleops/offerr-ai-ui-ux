/**
 * Offerr boundary lint rules.
 *
 * These exist because the two failures that would matter most on this repository
 * are invisible to every off-the-shelf rule set:
 *
 *   1. a client component reaching a `server-only` module, which is how the
 *      internal API secret or the database credential would end up in a browser
 *      bundle;
 *   2. a client component reading a private `process.env` value, which Next
 *      inlines at build time into the client chunk.
 *
 * Both are caught by the framework only in some configurations and only at build
 * time. A lint rule catches them in the editor and in CI, on every file, always.
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();

/** Extension candidates tried when resolving an extensionless import. */
const CANDIDATES = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

/** memo: absolute file path -> whether it (transitively) pulls in `server-only`. */
const serverOnlyCache = new Map();

/**
 * Strip comments before pattern-matching source text.
 *
 * `lib/offerr/session-constants.ts` DESCRIBES the server-only boundary in its
 * header comment while deliberately not importing it. Matching raw text would
 * flag that file and every client component that legitimately imports the cookie
 * names from it.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function resolveImport(importerFile, source) {
  let base;
  if (source.startsWith('.')) {
    base = path.resolve(path.dirname(importerFile), source);
  } else if (source.startsWith('@/')) {
    base = path.resolve(PROJECT_ROOT, source.slice(2));
  } else {
    // A bare specifier is a package. `server-only` itself is handled by the
    // caller; everything else in node_modules is out of scope.
    return null;
  }

  for (const suffix of CANDIDATES) {
    const candidate = base + suffix;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this candidate; try the next.
    }
  }
  return null;
}

/**
 * Does this module import `server-only`, directly or through its own imports?
 *
 * Transitive resolution is the point: a client component almost never imports a
 * credential-reading module directly. It imports a helper that imports it. A
 * direct-only check would pass while the bundle still failed.
 */
function importsServerOnly(file, depth = 0, seen = new Set()) {
  if (depth > 6 || seen.has(file)) return false;
  seen.add(file);

  const cached = serverOnlyCache.get(file);
  if (cached !== undefined) return cached;

  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    serverOnlyCache.set(file, false);
    return false;
  }

  const code = stripComments(source);

  if (/(?:^|\n)\s*import\s+['"]server-only['"]/.test(code) || /from\s+['"]server-only['"]/.test(code)) {
    serverOnlyCache.set(file, true);
    return true;
  }

  let result = false;
  const importRe = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(code)) !== null) {
    const resolved = resolveImport(file, match[1]);
    if (resolved && importsServerOnly(resolved, depth + 1, seen)) {
      result = true;
      break;
    }
  }

  serverOnlyCache.set(file, result);
  return result;
}

function isClientFile(sourceCode) {
  const body = sourceCode.ast?.body ?? [];
  for (const node of body) {
    if (node.type !== 'ExpressionStatement') break;
    const value = node.expression?.value ?? node.directive;
    if (value === 'use client') return true;
    if (typeof value !== 'string') break;
  }
  return false;
}

const noServerOnlyInClient = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Forbid a 'use client' module from importing anything that reaches a `server-only` module.",
    },
    schema: [],
    messages: {
      direct:
        "Client component imports '{{source}}', which is a `server-only` module. Server credentials must never be reachable from a browser bundle.",
      transitive:
        "Client component imports '{{source}}', which transitively reaches a `server-only` module. Split the shared values into a module that reads no server state.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    if (!isClientFile(sourceCode)) return {};

    const filename = context.filename ?? context.getFilename();

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') return;

        if (source === 'server-only') {
          context.report({ node, messageId: 'direct', data: { source } });
          return;
        }

        const resolved = resolveImport(filename, source);
        if (!resolved) return;

        // Distinguish "this module IS server-only" from "this module reaches one",
        // because the fix differs: the first is a wrong import, the second needs
        // the shared surface factored out.
        let directlyServerOnly = false;
        try {
          const code = stripComments(fs.readFileSync(resolved, 'utf8'));
          directlyServerOnly =
            /(?:^|\n)\s*import\s+['"]server-only['"]/.test(code) ||
            /from\s+['"]server-only['"]/.test(code);
        } catch {
          directlyServerOnly = false;
        }

        if (directlyServerOnly) {
          context.report({ node, messageId: 'direct', data: { source } });
          return;
        }

        if (importsServerOnly(resolved)) {
          context.report({ node, messageId: 'transitive', data: { source } });
        }
      },
    };
  },
};

const noPrivateEnvInClient = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Forbid reading a non-NEXT_PUBLIC_ `process.env` value from a 'use client' module.",
    },
    schema: [],
    messages: {
      private:
        "Client component reads `process.env.{{name}}`. Next inlines this into the browser bundle at build time; only NEXT_PUBLIC_* values may be read here.",
      computed:
        'Client component reads `process.env` with a computed key, so the value cannot be proven public. Read a named NEXT_PUBLIC_* variable instead.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    if (!isClientFile(sourceCode)) return {};

    /** `process.env` — the object being read, before the property access. */
    function isProcessEnv(node) {
      return (
        node?.type === 'MemberExpression' &&
        node.object?.type === 'Identifier' &&
        node.object.name === 'process' &&
        ((node.property?.type === 'Identifier' && node.property.name === 'env') ||
          (node.property?.type === 'Literal' && node.property.value === 'env'))
      );
    }

    return {
      MemberExpression(node) {
        if (!isProcessEnv(node.object)) return;

        if (node.computed && node.property.type !== 'Literal') {
          context.report({ node, messageId: 'computed' });
          return;
        }

        const name =
          node.property.type === 'Identifier' ? node.property.name : String(node.property.value);

        // NODE_ENV is replaced by the bundler with a literal and carries nothing
        // private; excluding it keeps the rule about credentials.
        if (name === 'NODE_ENV') return;
        if (name.startsWith('NEXT_PUBLIC_')) return;

        context.report({ node, messageId: 'private', data: { name } });
      },
    };
  },
};

export default {
  meta: { name: 'offerr-boundary', version: '1.0.0' },
  rules: {
    'no-server-only-in-client': noServerOnlyInClient,
    'no-private-env-in-client': noPrivateEnvInClient,
  },
};
