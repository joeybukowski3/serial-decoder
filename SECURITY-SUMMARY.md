# Security & Privacy Summary
## Item Assist — Serial Number Decoder
**Prepared:** February 27, 2026
**Prepared for:** Employer / IT Department Review

---

## 1. Tool Overview

The Item Assist Serial Number Decoder is a publicly accessible web tool hosted at **decodemyitem.com** that allows users to decode the manufacture date embedded in appliance, HVAC, and electronics serial numbers. It operates in two modes: a rule-based **Serial Decoder** that applies published manufacturer format tables to extract a year and week of manufacture from a serial number, and an AI-assisted **Smart Lookup** that accepts free-text queries (such as a product model number or brand name) and returns estimated manufacture year information using an external AI inference API. The tool requires no user account, collects no payment information, and does not maintain any persistent user profile or session. All server-side logic runs as stateless serverless functions on Vercel's infrastructure. The project is built with plain HTML, CSS, and JavaScript with no front-end framework or bundler.

---

## 2. Data Handled

The following is a complete inventory of every type of data a user can submit to this tool:

**Serial Decoder (rule-based):**
- Serial number string (alphanumeric, stripped of non-alphanumeric characters client-side before submission)
- Brand selection (chosen from a dropdown list of known manufacturers)
- Optional: Kenmore model number prefix (3 digits, selected from a dropdown)

**Smart Lookup (AI-assisted):**
- Free-text search query (max 200 characters; could contain a product model number, brand name, or product description)

**Contact Form:**
- Name (optional)
- Email address (optional)
- Message body (required)

**Feedback / Error Report Form:**
- Brand name (pre-populated from last decode)
- Serial number (pre-populated from last decode)
- Issue type (selected from a dropdown)
- Freeform details (optional)

**Data that is never collected:**
- No user accounts, login credentials, or passwords
- No payment or financial information
- No geolocation data (beyond the IP address visible to Vercel's infrastructure)
- No device fingerprinting or persistent cookies set by the application
- No biometric data
- No health information

---

## 3. Data Flow

### Serial Decoder (rule-based)

1. User selects a brand and enters a serial number in the browser.
2. All decode logic runs **entirely client-side** in JavaScript. No serial number is transmitted to any server for a standard rule-based decode.
3. If the decoder cannot produce a result, the browser silently sends a **decode alert** to `/api/decode-alert` containing: brand name, serial number, product category, failure reason, and a timestamp.
4. `/api/decode-alert` stores a deduplication key (`decodeAlert:<brand>:<serial>`) in **Upstash Redis** for 24 hours, then forwards the alert as a plain-text email to the site owner via **Resend**. No response data is returned to the browser.

### Smart Lookup (AI-assisted)

1. User types a query (e.g., "Whirlpool WRF535SWHZ") and submits the form.
2. The browser sends a `POST` request to `/api/age-lookup` with the body: `{ "query": "<text>", "researchInstructions": "<fixed prompt text>" }`.
3. The serverless function extracts the client IP address from the `x-forwarded-for` header and checks it against a **rate limit** (15 requests/minute) stored in **Upstash Redis**. The IP is not stored beyond the sliding rate-limit window.
4. The function checks **Upstash Redis** for a cached response keyed on the normalized query string. If a cache hit is found, the cached JSON is returned immediately and the query is not forwarded to any AI provider.
5. On a cache miss, the sanitized query string is embedded in a fixed prompt template and sent via HTTPS `POST` to **Google Gemini API** (`generativelanguage.googleapis.com`).
6. If Gemini fails or is rate-limited, the identical request is sent to the **Groq API** (`api.groq.com`) as a fallback using the Llama 3.1 70B model.
7. The AI provider returns a structured JSON object. The function validates the response, strips any internal metadata fields, and stores the result in **Upstash Redis** under the key `age-lookup:<normalized-query>` with a **14-day TTL**.
8. The validated JSON is returned to the browser. The browser renders the result; no user-identifying information appears in the response.

### Contact Form

1. User submits name, email, and message.
2. Browser sends `POST` to `/api/contact` with the three fields.
3. Serverless function forwards the data as a plain-text email to the site owner via **Resend** (`api.resend.com`). If the user provided an email address, it is set as `reply_to` on the outbound email.
4. No data is written to any database. Resend retains email logs per plan limits (see Section 4).

---

## 4. External Services Used

### 4.1 Google Gemini API — Primary AI Provider

| | |
|---|---|
| **Provider** | Google LLC |
| **Endpoint** | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |
| **Data sent** | User query string (max 200 chars) embedded in a fixed prompt template. No IP address or identifying information is included in the AI request body. |
| **Trains on API data?** | **No — on paid/billing-enabled API projects.** Google's Terms of Service explicitly state that for paid-tier Gemini API usage, prompts and responses are not used to improve Google's models. On the free tier, this protection does not apply. |
| **Log retention** | Optional developer logs (opt-in): 55 days. In-memory prompt cache: 24-hour TTL only. |
| **Zero Data Retention** | Available on paid tier by request. When enabled, all identifiable user data is sanitized before any logging occurs. |
| **Official policy** | https://ai.google.dev/gemini-api/terms |
| **Data retention policy** | https://ai.google.dev/gemini-api/docs/logs-policy |

**⚠ Action required:** Confirm that the `GEMINI_API_KEY` in use belongs to a **billing-enabled Google Cloud project**. If using a free-tier key, query data may be used to improve Google's models. This is the highest-priority item for company use.

---

### 4.2 Groq API — Fallback AI Provider

| | |
|---|---|
| **Provider** | Groq, Inc. |
| **Endpoint** | `https://api.groq.com/openai/v1/chat/completions` (model: Llama 3.1 70B) |
| **Data sent** | Identical query prompt as Gemini. Used only when Gemini is unavailable. |
| **Trains on API data?** | **No.** Groq's Services Agreement explicitly prohibits use of customer inputs or outputs for model training without customer permission. |
| **Log retention** | By default: **none**. Exception: up to 30 days for reliability/abuse investigation only. Batch processing files: 30 days. |
| **Zero Data Retention** | Available to all customers via GroqCloud Console Data Controls settings. |
| **Official policy** | https://console.groq.com/docs/your-data |
| **Services agreement** | https://console.groq.com/docs/legal/services-agreement |

---

### 4.3 Upstash Redis — Rate Limiting & Query Cache

| | |
|---|---|
| **Provider** | Upstash, Inc. |
| **Purpose** | Rate limiting (per IP, 15 req/min); AI response caching; alert deduplication |
| **Data stored** | Client IP address (rate-limit window only); normalized query string as Redis key (14-day TTL); full AI response JSON as value (14-day TTL); brand+serial as deduplication key (24-hour TTL) |
| **Most significant retention item** | A user's Smart Lookup query text remains stored as a Redis key for **14 days** |
| **SOC 2** | Yes — SOC 2 compliant on Pro and Enterprise tiers |
| **GDPR** | Yes — Data Processing Agreement available |
| **HIPAA** | Yes — Upstash Redis is HIPAA compliant |
| **Infrastructure** | AWS (customer-selected region at database creation) |
| **Official compliance** | https://upstash.com/docs/common/help/compliance |

---

### 4.4 Resend — Transactional Email Delivery

| | |
|---|---|
| **Provider** | Resend, Inc. |
| **Purpose** | Delivers contact form submissions, user feedback reports, and internal decode/usage alerts to site owner |
| **Data transmitted** | Contact form: name, email, message. Feedback form: brand, serial number, issue type, details. Decode alert: brand, serial number, failure reason. |
| **Log retention** | Free plan: 1 day. Pro plan: 3 days. Scale plan: 7 days. Infrastructure backups: 7 days. |
| **SOC 2** | Yes — SOC 2 Type II compliant (audited by Vanta) |
| **GDPR** | Yes — fully GDPR compliant |
| **Encryption** | AES-256 at rest; TLS 1.3 in transit |
| **Official policy** | https://resend.com/legal/privacy-policy |
| **Security page** | https://resend.com/security |

---

### 4.5 Vercel — Hosting Platform

| | |
|---|---|
| **Provider** | Vercel, Inc. |
| **Purpose** | Hosts the static site and all serverless API functions |
| **SOC 2** | Yes — **SOC 2 Type II** (Security, Confidentiality, Availability) |
| **ISO 27001** | Yes — **ISO 27001:2022** certified (September 2023) |
| **Function log retention** | Hobby plan: 1 hour. Pro plan: 1 day. Enterprise: 3 days. Observability Plus add-on: 30 days. |
| **HTTPS** | Enforced via `Strict-Transport-Security` header (`max-age=31536000; includeSubDomains; preload`) on all routes |
| **Trust center** | https://security.vercel.com/ |
| **Compliance docs** | https://vercel.com/docs/security/compliance |

---

### 4.6 Google AdSense — Advertising

| | |
|---|---|
| **Provider** | Google LLC |
| **Purpose** | Display advertising on all public pages |
| **Data processed** | Standard browser advertising telemetry per Google's advertising policies. The application does not pass user-entered data to AdSense. |
| **Note** | Google Analytics (GA4 / gtag.js) is **not present** on this site. AdSense is the only Google tracking integration. Publisher ID: `ca-pub-5946778263750869` |
| **Google Ad policy** | https://policies.google.com/privacy |

---

## 5. Hosting Security

**Platform:** Vercel, Inc. — a SOC 2 Type II and ISO 27001:2022 certified hosting provider.

**HTTPS:** Enforced on all routes via a `Strict-Transport-Security` header with a one-year `max-age`, `includeSubDomains`, and `preload` directive, ensuring all connections are encrypted in transit.

**Content Security Policy:** A strict CSP is configured in `vercel.json` that explicitly allowlists only required Google Ads infrastructure and Google Fonts. All other third-party connections are blocked by default. `object-src` is set to `none`; `form-action` is restricted to `self`.

**Additional security headers in place:**
- `X-Frame-Options: SAMEORIGIN` — prevents clickjacking via iframe embedding
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing attacks
- `Referrer-Policy: strict-origin-when-cross-origin`

**Serverless function log retention:** Pro plan: 1 day. Logs contain only error messages (Resend or AI provider error text). Per code review, user query content is **not** written to `console.log` under normal operation; it may appear in AI provider error objects if an error occurs during an AI call.

**Secrets management:** All API keys and credentials are stored exclusively as Vercel environment variables. No secrets are hardcoded in any source file or committed to the git repository. This was verified by full git history audit on February 27, 2026.

---

## 6. Risk Assessment

The worst-case compromise scenario for this tool would be unauthorized access to the Upstash Redis database, which contains: normalized Smart Lookup query strings (up to 14 days of queries), brand name and serial number combinations from failed decode attempts (24-hour retention), and client IP addresses within the active rate-limit window. In this scenario, an attacker could read a list of search queries submitted by users over the prior two weeks and a partial list of serial numbers that failed to decode. Because the tool collects no accounts, names, email addresses, or payment information from users during normal operation — and because appliance serial numbers and product search queries are not inherently sensitive personal data — the privacy impact of such a breach would be low. The tool does not handle protected health information (HIPAA), financial data (PCI), or data from minors (COPPA). Contact form submissions (which do contain user email addresses and message content) are processed by Resend and delivered directly to the site owner's inbox; they are not stored in any application database. The combination of Vercel's SOC 2 hosting environment, Upstash's SOC 2 and HIPAA-compliant Redis infrastructure, and the short TTL windows on all cached data (14 days maximum) means the exposure window for any data is limited in both scope and duration.

---

## 7. Recommended Next Steps

The following items should be addressed before company-wide or commercial rollout:

**Priority 1 — Confirm Gemini API billing tier**
Verify that the `GEMINI_API_KEY` in use is associated with a **billing-enabled Google Cloud project**. Free-tier Gemini API keys permit Google to use prompts and responses to improve their models. This is a material data governance concern if employee or company-related queries will be submitted. If confirmed as paid tier, consider formally requesting **Zero Data Retention (ZDR)** via Google Cloud Support.

**Priority 2 — Reduce Upstash query cache TTL**
The current Smart Lookup cache TTL is 14 days, meaning user queries persist in Upstash Redis for two weeks. For company use, consider reducing this to 24–72 hours to minimize the volume of data held in the cache at any point in time. This is a one-line change in `/api/age-lookup.js`.

**Priority 3 — Add a Privacy Policy page**
The site currently has a `/privacy-policy` route in `vercel.json` but the policy content should be reviewed to ensure it discloses: the use of Google Gemini and Groq for AI inference, the use of Upstash Redis for caching queries, the use of Resend for email delivery, and the AdSense integration. This disclosure is required under GDPR, CCPA, and most enterprise IT acceptable-use frameworks.

**Priority 4 — Switch Resend to a verified custom domain**
Email alerts are currently sent from `onboarding@resend.dev`, a shared Resend sending domain. For professional and deliverability purposes, Resend should be configured with a verified custom domain (e.g., `noreply@decodemyitem.com`). This does not affect data security but affects email authenticity and professionalism.

**Priority 5 — Consider enabling Groq Zero Data Retention**
Groq offers Zero Data Retention to all customers via the GroqCloud Console Data Controls settings. Enabling this ensures that even the 30-day reliability/abuse-investigation exception does not apply to query data. This is a dashboard toggle with no code change required.

**Priority 6 — Document the ALERT_EMAIL_TO recipient**
The `ALERT_EMAIL_TO` environment variable receives all internal alerts (decode failures, contact submissions, feedback reports, usage thresholds). Confirm this is a monitored company inbox rather than a personal email address, and document the recipient for IT records.

---

*Document generated from direct code audit of the `serial-decoder` repository (branch: `internal`, commit: `24c83bf`) and official policy documentation as of February 27, 2026. Policy URLs should be reverified periodically as provider terms may change.*
