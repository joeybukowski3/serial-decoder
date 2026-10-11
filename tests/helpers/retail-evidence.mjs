/**
 * Offline retail-evidence helpers. Replacement candidates must prove a live, new, first-party purchase path before they can be
 * recommended, so any fixture page that stands in for a candidate needs a price and an active purchase control. The clock is
 * fixed so model-age rules never depend on the day the tests run.
 */

export const RETAIL_NOW = () => Date.UTC(2026, 9, 10);

export const PURCHASE_PATH = '<p>$899.99</p><button type="button">Add to cart</button>';

/** Appends a visible price and an active purchase control; extraction of specs and identity is unaffected. */
export const withPurchasePath = (html) => `${html}${PURCHASE_PATH}`;

/** Appends wording that a retired manufacturer page carries. */
export const withDiscontinuedNotice = (html) => `${html}<p>This product has been discontinued.</p>`;
