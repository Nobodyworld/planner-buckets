# Contributing

Thanks for helping improve Buckets & Shovels Planner.

## Development setup

1. Install Node.js 20.x, 22.x, or 24.x.
2. Install dependencies:

```bash
npm install
```

1. Run locally:

```bash
npm run dev
```

## Branch and PR workflow

1. Create a feature branch from `main`.
2. Keep commits focused and small.
3. Run checks before opening a PR:

```bash
npm run verify
```

1. Open a PR with:

- What changed
- Why it changed
- How to test it
- Screenshots/GIFs for UI changes

## Coding guidelines

- Use TypeScript types for new data/state shapes.
- Prefer small reducer actions with explicit state transitions.
- Keep animation/motion timings on shared CSS tokens when possible.
- Avoid changing unrelated behavior in the same PR.

## Testing guidelines

- Add or update reducer tests for logic changes in `src/state/plannerReducer.ts`.
- For UI behavior changes, include manual test steps in the PR. Cover affected drag/drop, clipboard, sidepanel, import/export, and responsive states when relevant.

## Security and privacy

- Do not commit secrets or tokens.
- Do not commit local export files (`bucket-planner-*.json`).
- Follow [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
