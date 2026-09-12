# Browser

Browser is Jawaid's personal, AI-driven web browser — one user, one machine.
It is a fork of [BrowserOS](https://github.com/browseros-ai/BrowserOS), a
Chromium-based browser with a built-in agent stack (MCP server, side panel
chat, new-tab agent), with a personal UX layer on top: spaces, a Zen-inspired
sidebar, full-page capture, and no promos.

Licensing: BrowserOS is AGPL-3.0 (Felafax, Inc.), Chromium is BSD-3-Clause, and
the ungoogled-chromium patches are BSD-3-Clause. See `NOTICE` and the `LICENSE`
files. This fork keeps every upstream license and attribution intact.

Run it: `bun run personal:build` then `bun run personal:start` from
`packages/browseros-agent`. Details and everything else: [`docs/personal/`](docs/personal/).
