# Launch Prep Todo: Cleanup, Stripe, and Pricing

## Phase 1 — Cleanup (Week 1)

Goal: remove dead weight and fix the obvious UX gaps before taking money.

- [ ] **Audit and hide unfinished features**
  - Remove or disable Facebook/HeartBeat leftovers (routes, tables, sidebar entries if any remain).
  - Hide "Agents" and "Automation" pages unless they have real end-to-end flows; otherwise show "Coming soon" placeholders.
  - Remove any unused imports, dead routes, and orphaned components surfaced by `bun run build`.

- [ ] **Fix navigation and state bugs**
  - Ensure upload queue stays visible and survives all navigation paths.
  - Verify library selection toolbar appears only above the correct grid.
  - Re-test move/delete on raw, geo-tagged, and published tabs for duplicates or data loss.

- [ ] **Polish the three core screens**
  - Library: consistent empty states, badge placement, and bulk-action feedback.
  - Geo-tagging: validate that manual lat/lng inputs persist and map stays centered.
  - Post generator / Scheduler: confirm CTA fields are fully gone and CSV upload passes in GHL.

- [ ] **Add a simple landing/marketing page**
  - Replace the current root (`/`) with a public-facing hero + pricing + CTA.
  - Keep `/dashboard` as the authenticated entry point.

- [ ] **Smoke-test the entire happy path**
  - Upload video → extract frames → geo-tag → create post → schedule → export CSV.
  - Document any blocking bugs.

## Phase 2 — Stripe Billing (Weeks 2–3)

Goal: turn the app into a paid product with a single subscription tier.

- [ ] **Choose the billing model**
  - Recommendation: one plan at $49–$149/month with usage-based overages (seats, images, or videos).
  - Keep it simple: flat monthly subscription for v1; add tiers later based on feedback.

- [ ] **Enable Lovable Payments (Stripe)**
  - Run provider eligibility check.
  - Enable Stripe seamless payments.
  - Create the product/price in test mode.

- [ ] **Build subscription gating**
  - Add `subscriptions` table or use Stripe Customer/Subscription webhooks.
  - Add RLS-protected `user_subscriptions` view.
  - Gate core features (post scheduling, bulk download, video processing) behind active subscription.
  - Show an upgrade CTA for free/trialing users instead of hard errors.

- [ ] **Implement checkout and billing portal**
  - "Upgrade" button in settings and on paywalls.
  - Stripe Checkout session for new subscriptions.
  - Stripe Customer Portal for plan changes/cancellations.
  - Webhook handler at `/api/public/webhooks/stripe` to sync status.

- [ ] **Free trial logic**
  - 14-day trial on signup, no card required.
  - Show trial countdown in UI.
  - Convert or lock at trial end.

## Phase 3 — Pricing & Packaging (Week 4)

Goal: decide what to charge and how to present it.

- [ ] **Define the launch tier**
  - **Pro:** $99/month (recommended starting price for agencies).
  - Includes: unlimited images, 50 videos/month, 3 team seats, GMB post scheduler, geo-tagging, CSV export.
  - Overages: $2 per extra video or $10 per extra seat.

- [ ] **Create the pricing page**
  - Public `/pricing` route.
  - One clear plan + FAQ + "Start 14-day free trial" CTA.
  - Avoid complex tier tables for launch.

- [ ] **Add usage tracking**
  - Count videos processed, images uploaded, scheduled posts.
  - Show current usage in Settings → Billing.
  - Enforce soft limits before billing overages.

- [ ] **Set up customer support paths**
  - In-app "Request feature" / "Report bug" form.
  - Support email in footer and billing emails.

## Phase 4 — Pre-Launch Hardening (Week 5)

- [ ] **Security and privacy**
  - Re-run security scan and fix any new findings.
  - Add public privacy policy and terms of service pages.
  - Ensure all image URLs are signed and no-indexed.

- [ ] **Onboarding**
  - First-run wizard: connect GMB (if still desired), upload first image, geo-tag one photo.
  - Empty-state CTAs that guide new users.

- [ ] **Analytics and monitoring**
  - Track key events: signup, trial start, subscription convert, video upload, post scheduled.
  - Add a simple dashboard for weekly active users and conversion.

- [ ] **Launch checklist**
  - Switch Stripe to live mode.
  - Configure custom domain and remove Lovable badge.
  - Set up support inbox.
  - Soft launch to 5–10 agency friends for feedback.

## Suggested timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Cleanup | 1 week | Stable, de-cluttered app |
| Stripe billing | 2 weeks | Paid subscription + trial |
| Pricing & packaging | 1 week | Public pricing + usage limits |
| Pre-launch hardening | 1 week | Launch-ready private beta |
| **Total** | **~5 weeks** | **Paid private beta** |

## Out of scope for launch

- Multi-tenant workspaces / agencies-as-orgs.
- Direct GMB API publishing (keep CSV scheduler).
- Two-way Google Drive sync.
- Advanced AI agents beyond post generation.
- Mobile native app.

## Open decisions before I build

1. Should I start with the cleanup pass, or do you want to jump straight to Stripe setup?
2. Is $99/month the right starting price, or do you want a lower $49/month starter tier?
3. Do you want to keep a limited free plan, or only a 14-day free trial?
