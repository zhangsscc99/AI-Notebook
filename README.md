# Agent Systems Field Guide

A source-backed knowledge site for agent runtimes, Claude Code, OpenClaw,
DeepSeek Harness, multi-agent systems, tool use, memory, sandboxing, and
agentic reinforcement learning.

The frontend is built with React 19, TypeScript, Vite, React Router, and Fuse.js.
Article bodies are loaded on demand, search data is loaded only when search is
opened, and the production server adds Brotli/Gzip compression, immutable asset
caching, and SPA route fallback.

## Development

```bash
npm install
npm run dev
```

`npm run content` extracts the 24 research tracks, 192 articles, and search
metadata from `content-source/index.html` and `sections/`.

## Production

```bash
npm run build
node server.mjs --port 8765 --host 0.0.0.0 --dir dist
```

## Validation

```bash
npm run check
npm run build
```

The deployed site is tested with Chromium across all article routes, desktop and
mobile viewports, search, deep links, and browser console errors.
