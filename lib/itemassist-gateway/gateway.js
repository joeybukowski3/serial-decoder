import { ERROR_HTTP_STATUS, buildResearchError } from '../itemassist-research/contract.js';

/**
 * One Vercel function (api/itemassist-replacement.js) serves two ItemAssist routes, because the Hobby plan allows 12 functions:
 *   /api/itemassist-replacement  -> the v1 replacement handler (unchanged)
 *   /api/itemassist-research     -> the Research handler, reached through a vercel.json rewrite to the function above
 *
 * The choice is made from the request pathname alone. Headers, the query string, cookies and the body are never consulted, so nothing a
 * caller sends can select the Research handler. Anything that is not exactly the Research path goes to v1, which is what that function
 * has always done; if a platform change ever stopped presenting the original path, Research would fail closed (v1 rejects its body
 * before any store or provider is touched) instead of becoming reachable from another path.
 *
 * The two handlers stay separate: each checks its own feature flag, token, validation, cache and budget. This module reads no environment.
 */
export const RESEARCH_PATH = '/api/itemassist-research';

/**
 * The pathname exactly as received. Deliberately not `new URL()`: a leading '//' would be read as a host, hiding the real path.
 * Anything that is not an origin-form request target (no leading '/') yields '', which never matches a route.
 */
export function requestPathname(req) {
  const target = typeof req?.url === 'string' ? req.url : '';
  if (!target.startsWith('/')) return '';
  const end = target.search(/[?#]/);
  return end === -1 ? target : target.slice(0, end);
}

export const isResearchRequest = (req) => requestPathname(req) === RESEARCH_PATH;

/** The Research module loads on the first Research request, so it cannot slow or break a v1 cold start. */
async function loadResearchHandler() {
  return (await import('../itemassist-research/handler.js')).default;
}

/** `replacement` is the v1 handler; `loadResearch` resolves to the Research handler (tests inject both). */
export function createItemAssistGateway({ replacement, loadResearch = loadResearchHandler }) {
  return async function gateway(req, res) {
    if (!isResearchRequest(req)) return replacement(req, res);
    let handler;
    try {
      handler = await loadResearch();
    } catch {
      res.setHeader?.('Cache-Control', 'no-store');
      return res.status(ERROR_HTTP_STATUS.ENGINE_ERROR).json(buildResearchError('ENGINE_ERROR'));
    }
    return handler(req, res);
  };
}
