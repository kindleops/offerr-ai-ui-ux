import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Previously `ignoreBuildErrors: true`, which meant the production build
    // never typechecked — a type error would ship rather than fail the deploy.
    // `pnpm typecheck` passes clean, so the gate is closed rather than bypassed.
    // Re-enabling the bypass must be a deliberate decision, not a convenience.
    ignoreBuildErrors: false,
  },
  turbopack: {
    // Without this, Next walks up, finds `/Users/ryankindle/package-lock.json`
    // and treats the HOME DIRECTORY as the workspace root — which silently
    // changes module resolution and file tracing for every build.
    root: projectRoot,
  },
};

export default nextConfig;
