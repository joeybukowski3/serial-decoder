# USER.md — About Your Human

## Basic Info
- **Name:Joey Bukowski
- **What to call them:Joey
- **Pronouns:Mr.
- **Timezone:eastern standard time

## Working Style
- Prefers to understand what's happening, not just have it done — explain briefly.
- Learning to code — avoid jargon without context. Show the whole file when changes are needed.
- Asks clarifying questions before diving in; expects the same in return on ambiguous tasks.
- Wants concise responses. No filler, no sycophancy.

## Active Projects
**decodemyitem.com (serial-decoder repo)**
- Serial number decoder + Smart Lookup (AI-assisted item age/replacement tool).
- Item Assist app lives under the same repo; uses `api/` Vercel routes.
- Gemini API handles smart queries. Upstash Redis handles caching.
- LKQ replacement logic lives in `api/lkq-lookup.js` — prefer current-gen successors, avoid stale cache returns.
- UI preference: clean card layouts, reduced redundancy, polished CTAs.

## Preferences
- Design: card-based, primary result first, compact and scannable.
- Branding: always "Decode My Item" + "Decode - Research - Automate."
- Support pages: tool-entry feel with colorful CTAs, not plain text links.
- Age estimates spanning multiple years: show midpoint rounded to more recent year, confidence = Medium.

## Notes
_(Build this over time — decisions, context, what works, what doesn't.)_
