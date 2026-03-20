ItemAssist Platform Overview (OpenClaw Project Context)

PLATFORM PURPOSE



itemassist.com is a research platform designed to help insurance property claims professionals quickly identify, research, and price personal property items during the claims process.



The system focuses on producing structured, defensible research outputs that can support claim documentation and decision-making.



The platform consists of three primary tools that operate independently but are interconnected to allow a smooth workflow.



PRIMARY USER GROUP



The platform is designed primarily for:



insurance claims professionals



field investigators



property consultants



technical claim reviewers



Secondary users may include:



contractors



appraisers



equipment owners researching products



Users typically need answers quickly while handling active claims, so speed and clarity are critical.



CORE PROBLEM THE PLATFORM SOLVES



Claims professionals frequently need to determine:



what an item is



when it was manufactured



what its specifications are



what a reasonable modern replacement would be



what the current market price is



Today this requires searching across:



manufacturer websites



retailer listings



manuals



Google search results



forums and scattered sources



This process is slow and inconsistent.



ItemAssist consolidates those steps into a structured research workflow.



SYSTEM ARCHITECTURE



The platform is composed of three primary research tools.



Each tool can be used independently but is designed to chain into the next tool.



Serial Decoder → Smart Lookup → Replacement Price Tool

TOOL 1 — SERIAL NUMBER DECODER



The Serial Number Decoder analyzes appliance and electronics serial numbers to determine manufacturing information.



Input



Serial number from an appliance or electronics product.



Output



Result card showing:



Brand



Product category



Manufacture date (month/year)



Estimated age



Model line / series



Confidence level



Derivable specification flags



Confidence states:



Confirmed



Estimated



Insufficient Data



Manufacturer Coverage



The decoder currently supports approximately 4,479 serial format patterns.



Major manufacturer groups include:



Whirlpool Corporation



Whirlpool



Maytag



KitchenAid



Amana



Jenn-Air



GE / Haier



GE



GE Profile



GE Café



Hotpoint



Electrolux Group



Electrolux



Frigidaire



Gibson



Samsung (appliances and electronics)



LG (appliances and electronics)



BSH Group



Bosch



Thermador



Gaggenau



Kenmore (prefix routing to correct underlying manufacturer)



Water Heater Manufacturers



A.O. Smith



Rheem



Bradford White



State



American



Kenmore water heaters



Additional Behavior



If the serial number is not recognized:



a brand selector dropdown appears



the user can retry decoding manually



Tool Chaining



After decoding, users are prompted to continue to Smart Lookup with decoded information pre-filled.



TOOL 2 — SMART LOOKUP / LKQ RESEARCH



Smart Lookup is a flexible search tool designed to interpret inputs through an insurance claims research lens.



Accepted Inputs



model numbers



brand + product descriptions



vague descriptions such as

"older Samsung front load washer"



Output



Ranked item suggestions including:



overview



typical specifications



market position



LKQ replacement options



LKQ Rating System



Four tiers with color indicators:



Above LKQ (purple dot)

Replacement exceeds the original item.



LKQ (green dot)

True Like Kind and Quality match.



Close Match (amber dot)

Comparable item with minor differences.



Not LKQ (red dot)

Meaningfully different item.



Additional Features



"Did you mean?" query correction



ranked suggestions when multiple item types match



sourcing notes for replacements



general overview mode for vague queries



Intelligent Routing



If a query appears to contain a serial number pattern:



The system suggests routing to the Serial Number Decoder.



Tool Chaining



From each result card users can launch:



Replacement Price Tool



TOOL 3 — REPLACEMENT PRICE TOOL



This tool finds current retail pricing for a product or equivalent item.



Data Sources



Primary source:



Best Buy Product API



Secondary source:



Google Shopping via SerpAPI



Result Filtering



Results include only:



brand new items



authorized retailers



direct product listings



Excluded sources:



used items



refurbished items



marketplace sellers



Result Display



Each result includes:



item name



current price



retailer



product link



confidence indicator



Confidence levels:



High



Medium



Low



Special Handling



If the original item is discontinued:



The system suggests the closest modern equivalent.



If results are sparse:



Users are offered a pivot back to Smart Lookup.



TOOL INTERCONNECTIONS



The tools are intentionally linked.



Serial Decoder → Smart Lookup



"Find LKQ Replacement" button pre-fills Smart Lookup using decoded information.



Smart Lookup → Replacement Price Tool



Each result card contains:



"Get Current Price"



Smart Lookup → Decoder



If a serial pattern is detected, the system suggests switching to the decoder.



Replacement Price → Smart Lookup



If pricing results are sparse or discontinued items appear, users can pivot to Smart Lookup.



AI CHAT ASSISTANT



A context-aware chat assistant is available from a floating button on all tool pages.



Interface Behavior



slide-in panel



not a modal overlay



conversation stored in localStorage



session persistence



Context Awareness



The assistant knows which tool page the user is currently on.



Responses adapt to the tool context.



Features



"New Context Question" button resets the context for a fresh query.



TECH STACK



Frontend

React / Next.js



Deployment

Vercel



Styling

Tailwind CSS



APIs



Best Buy Product API

Primary pricing source



SerpAPI

Supplemental product pricing



OpenAI API

AI chat assistant



Email



Resend via Vercel serverless function



/api/send-feedback

SECURITY MODEL



Environment variables stored server-side:



OPENAI\_API\_KEY

BESTBUY\_API\_KEY

SERPAPI\_KEY

RESEND\_API\_KEY

FEEDBACK\_EMAIL

NEXT\_PUBLIC\_SITE\_URL



Additional characteristics:



no user authentication



no accounts



no personal data stored



HTTPS enforced



VISUAL DESIGN



Design philosophy:



light



minimal



professional



Visual characteristics:



White primary backgrounds

Warm light gray secondary surfaces

Inter typography

Single teal accent color



Avoid:



gradients



heavy decorative UI



overly consumer-focused styling



Layout:



Desktop: two-column tool layout

Mobile: single column



Results load inline via React state.



Skeleton loading indicators appear during API calls.



Confidence indicators appear as pill badges.



ROUTES

/

Homepage



/decode

Serial Number Decoder



/lookup

Smart Lookup / LKQ Research



/pricing

Replacement Price Tool



/about

About page



/privacy

Privacy Policy



/terms

Terms of Use



/security

Data Protection \& Security



/feedback

Feedback form

COMPONENT STRUCTURE

/components/layout/

Navbar

Footer

PageWrapper



/components/tools/

DecodeInput

DecodeResult

LookupInput

LookupResult

LKQBadge

PriceResult

ConfidenceBadge



/components/chat/

ChatPanel

ChatMessage

ChatInput



/components/ui/

Button

Input

Card

Badge

Spinner

SkeletonCard



Tool pages pass pre-filled values using:



useSearchParams

PRODUCT DECISIONS AND CONSTRAINTS



The platform specifically targets insurance claims workflows.



Terminology must remain professional.



The UI must not include:



adjuster



settlement



policyholder



until later product stages.



Replacement items must always be:



new



authorized retailer listings



Never include:



used



refurbished



marketplace sellers



Smart Lookup must interpret queries through an insurance research perspective.



Confidence indicators are critical.



Incorrect prices shown confidently create liability.



FUTURE DEVELOPMENT AREAS



Possible future improvements include:



expanded manufacturer databases



improved replacement scoring logic



deeper spec analysis



broader product category support



enhanced research automation



internal data analytics



OPENCLAW ROLE



OpenClaw may assist with:



repository architecture improvements



React / Next.js code review



UI / UX improvements



search logic improvements



LKQ scoring improvements



serial number database expansion



API optimization



performance improvements



SEO metadata



professional claims-focused copywriting



feature suggestions



OpenClaw should analyze and recommend improvements, not modify code automatically.

Instruction:

Do not modify files. Only analyze and recommend improvements.

