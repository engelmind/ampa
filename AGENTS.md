# AGENTS.md — AMPA Agustinos Granada

## Skills: Modern Web Guidance

For work affecting HTML, CSS, client-side JavaScript/TypeScript, React UI behavior, accessibility, Core Web Vitals, browser compatibility, mobile forms, dialog/modals, tables, or client-side PDF preview controls, read the official copied skill at `.agents/skills/modern-web-guidance/SKILL.md` **before** proposing or writing changes.

- Follow the upstream skill's focused `search` → `retrieve` process with `npx -y modern-web-guidance@latest` when network/npm access is available. Keep dependencies and existing architecture unless changes are justified.
- If npm/network is unavailable, consult the vendored guide at `.agents/skills/modern-web-guidance/guides/ui-components/dialog.md` where relevant; read official guides directly from https://github.com/GoogleChrome/modern-web-guidance/tree/main/skills/modern-web-guidance/guides for other topics. Clearly disclose that the CLI was not run.
- Do not use `legacy-scan` for a narrowly scoped UI component change. Use it only for open-ended legacy modernization reviews, and confirm each result manually.
- Preserve the deployed functionality, data model, PDF export/share behavior (particularly Safari/iOS user activation), typography, palette, roles and server security.
- Before any UI deployment: compare against production, perform a local build and TypeScript check, validate keyboard/screenreader behavior and iOS Safari where possible, test PDFs, and obtain approval before promotion to production.
- Do not enable Origin Trials or volatile browser features by default. Prefer Baseline Widely Available APIs, with fallbacks as prescribed by the guide.

Source: https://github.com/GoogleChrome/modern-web-guidance
Installed: 2026-11-21 (skill text vendored; browser guidance available locally; npm CLI requires runtime/network access).
