// Canonical age-research objective shared by every Smart Lookup age provider.
// Keep this stable and near the front of prompts so provider prompt caching is
// effective and OpenAI/xAI/Gemini do not drift toward different objectives.
export const ESTIMATE_FIRST_RESEARCH_OBJECTIVE = `
Identify the most likely physical product represented by the query and estimate when that model, model line, or product family was introduced or likely produced.

The goal is a useful approximate age estimate, not an exact individual-unit manufacture date. Prefer, in order: (1) a likely single year when strongly supported, (2) a short production range, (3) a broader early/mid/late-decade period, and (4) product-family or category-era context when exact identity cannot be established.

Always return the strongest useful estimate available. Limited evidence broadens the range and lowers confidence; it never makes a meaningful product query empty. Start with one focused search and use at most one reformulation only when the first search has no useful evidence. Prefer three to five useful sources, removing duplicate domains and duplicate evidence. Stop as soon as one credible dated source, two broadly consistent independent sources, reliable generation evidence, or recognized-family history supports a reasonable period. Do not research an exact month, day, factory run, or confirmed production end unless it is immediately available.

Clearly distinguish model or product introduction timing from the manufacture date of the user's individual unit. Never claim an exact individual-unit date without serial decoding or manufacturing-label evidence.`;
