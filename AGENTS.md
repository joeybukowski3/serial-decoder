# AGENTS.md — Workspace Rules

## Session Startup
Before doing anything else:
1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context

Don't ask permission. Just do it.

## Memory
You wake up fresh each session. These files are your continuity.
- **Daily notes:** `memory/YYYY-MM-DD.md` — log decisions, context, changes made
- **No mental notes** — if it matters, write it to a file. Files survive restarts. Memory doesn't.
- When you learn a lesson or make a mistake, document it so future-you doesn't repeat it.

## Red Lines
- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- `trash` > `rm` — recoverable beats gone forever.
- When in doubt, ask.

## External vs Internal
**Do freely:** read files, explore, organize, search, work within the workspace.
**Ask first:** sending emails, public posts, anything that leaves the machine, anything you're uncertain about.

---

## Code Update Rules
These apply before and during every code change.

**Before every change:**
- State what you believe the goal is before writing any code.
- If the goal is ambiguous, stop and surface it. Do not guess.
- Read the relevant file, function, and any immediate callers before touching anything.
- If you don't know why something is structured a certain way, ask before changing it.

**Making changes:**
- Write the minimum code that solves the problem. Nothing more.
- Touch only what is necessary. Do not clean up or reformat adjacent code.
- Match the existing style, naming, and conventions of the file exactly.
- If two patterns conflict, pick the more recent one and flag the conflict. Do not blend them.
- Push back when a simpler approach exists.

**Verifying changes:**
- Define what success looks like before finishing.
- Verify output matches actual intent, not just the literal instruction.
- After each significant step, summarize: what changed, what was verified, what remains.
- If anything was skipped or unverified, say so before marking done.

**Fail loud:**
- "Done" is wrong if anything was skipped silently.
- "It works" is wrong if it was not actually tested or verified.
- If you lose track of the goal, stop and restate before continuing.
- Surface uncertainty. Never hide it.

**Token efficiency:**
- Be concise. Omit filler and redundant explanation.
- If a task is growing complex, break it into steps and checkpoint between them.
- If context is getting long, flag it and offer to summarize before continuing.

---

## Project: decodemyitem.com
**Local dev:** always use `npx vercel dev` — not `npx serve .` (api/ routes won't work otherwise).
**Local testing:** use explicit `.html` routes (`/index.html?cat=...`) — bare `/?...` URLs are unreliable locally.
**Automated browsers:** All automated browser testing, screenshots, debugging, and visual verification must use the repository's Playwright analytics-blocking setup. Automated browser sessions must not send Google Analytics or Google Tag Manager traffic. Do not bypass or remove this protection.
**Stack:** Vercel, `api/` routes, Gemini API, Upstash Redis.
**Key files:** `index.html`, `script.js`, `api/lkq-lookup.js`, `api/smart-query-interpret`.
**Deployment:** always confirm before pushing live — default assumption is changes are local only.

**Design conventions:**
- Card-based layouts, primary result first, minimal redundant metadata.
- Standalone mini-tool cards, not add-on sections.
- Colorful CTA buttons on support/brand pages.
- Serial number location sections: checklist-style, broken out by manufacturer and item type.

**Branding:**
- Site name: "Decode My Item"
- Tagline: "Decode - Research - Automate."
- Hero copy: "Fast Serial Number Decoding and Smart Item Age Verification Tool"

**Routing rules:**
- Old brand/category pages → redirect entry points with prefilled params, not legacy UI.
- Samsung defaults to appliances first.
- `mode=smart` / `#panel-smart` opens Smart Lookup workflow.
