# True Gig Pay — static site

A free, single-purpose calculator site for gig drivers: true hourly earnings
after vehicle costs and self-employment tax, legal pay-floor checks
(CA Prop 22, NYC, Seattle, Washington rideshare), and an offer quick-checker.

**Pure static site.** No build step, no backend, no dependencies, no external
requests. System fonts only. All math runs client-side from two files:

- `calc.js` — pure calculation functions + the dated CONSTANTS block (Node-importable for tests)
- `app.js` — form handling, validation, and rendering for `index.html`

Pages: `index.html` (the tool), `methodology.html`, `prop-22.html`,
`nyc-pay.html`, `irs-mileage.html`, `about.html`, plus `styles.css`,
`favicon.svg`, `robots.txt`, `sitemap.xml`.

---

## Deploy to Cloudflare Pages (free)

### Option A — Direct upload (no Git, fastest)
1. Create a free Cloudflare account and verify your email.
2. Dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
3. Name the project, then upload this whole `site/` folder (or a ZIP of it).
4. Deploy. Your site is live at `https://<project>.pages.dev`.
5. (Optional) Attach a custom domain later under the project's **Custom domains** tab.

### Option B — Git-connected (auto-deploy on push)
1. Push this folder's contents to a GitHub repository (see below).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repo. Build settings: **Framework preset: None**, **Build command: (empty)**, **Build output directory: `/`** (or the folder containing `index.html` if the repo root is higher).
4. Deploy. Every push to the production branch redeploys automatically.

## Deploy to GitHub Pages (free alternative)
1. Create a GitHub repository and push the contents of this `site/` folder to it.
   - For a user/organization site (`<username>.github.io`), files must be at the repo root.
   - For a project site, files can be at the root or in `/docs`.
2. Repo **Settings → Pages** → Source: **Deploy from a branch** → pick the branch and folder.
3. Save. The site publishes at the URL shown on that settings page.

## After deploying (either platform)
1. Replace the placeholder domain `https://truegigpay.example.com` in
   **`robots.txt`** and **`sitemap.xml`** with the real domain.
2. Visit every page on the live URL and re-run one calculator example by hand
   against `tests/tests.js` expectations.
3. Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools.

## Updating rates (the only routine maintenance)

All rates live in **one place**: the `CONSTANTS` block at the top of `calc.js`.
Each constant names its source and effective period in a comment.

Update calendar:
| What | When it changes | Source to check |
|---|---|---|
| IRS standard mileage | Each December for the next year; rarely mid-year | IRS "Standard mileage rates" page / annual notice (+ mid-year IR if issued) |
| Social Security wage base | Each fall for the next year | SSA wage-base announcement |
| CA minimum wage / Prop 22 per-mile | January 1 | CA DIR; CA State Treasurer Prop 22 figures |
| NYC delivery minimum pay | April 1 | NYC DCWP |
| Seattle per-minute / per-mile / per-offer | January 1 | Seattle Office of Labor Standards |
| WA TNC (rideshare) rates | January 1 | WA L&I "Getting Paid" page |

Procedure:
1. Verify the new figure on the official source (never a blog or another calculator).
2. Edit the constant(s) in `calc.js`, and update the comment with the new source/effective date.
3. Set `RATES_VERIFIED_ON` to today's date, and update the "rates verified" dates in the page footers, the constants strip on `index.html`, and `methodology.html`.
4. Update the worked examples in `tests/tests.js` if a constant you changed is used in one, then run: `node ../tests/tests.js` (must be all-pass).
5. Add a `CHANGELOG.md` entry (in the project root, one level up from this folder).
6. Redeploy (Git push, or re-upload the folder).

## Tests

Calculation tests live outside this folder at `../tests/tests.js` and run with
plain Node — no packages to install:

```
node ../tests/tests.js
```

They cover the mileage split-rate boundary, SE tax including the Social
Security wage-base cap, all five pay floors, the offer quick-check, and
NaN/Infinity edge cases, each with the hand-computed math in comments.
