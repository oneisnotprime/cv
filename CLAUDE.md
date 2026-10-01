# Notes for Claude

- Name: the user calls the Claude agent working on this repo **θ** (theta). Co-creator of FOOM: Escape Velocity; credited as "θ · a Claude Code agent" on the title screen.
- Standing instruction: merge PRs without asking once the change is tested locally (headless Playwright). Verify the live deploy at https://cv-v9bc.vercel.app/foom/ afterwards.
- Vercel (free plan) has a daily deployment limit. `vercel.json` disables deploys for `ccr-*` branches, so PRs from those branches show no Vercel checks; only merges to main deploy. Batch changes into fewer merges when possible.
- FOOM lives in `foom/` (vanilla JS, no build step). Bump `BUILD` in `foom/game.js` when shipping a player-visible change.
