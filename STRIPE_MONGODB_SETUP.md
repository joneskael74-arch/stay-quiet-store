# Stay Quiet — Stripe + MongoDB setup

## Vercel environment variables

Add these to the Vercel project (Production, and Preview if you want to test preview deployments):

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Config, `pk_test_...`
- `STRIPE_SECRET_KEY` — Secret, `sk_test_...`
- `STRIPE_WEBHOOK_SECRET` — Secret, `whsec_...`
- `MONGODB_URI` — Secret
- `MONGODB_DB` — Secret, e.g. `stay_quiet`
- `ADMIN_TOKEN` — Secret, a long random value used only when adding products

## Stripe webhook

After the first deployment, create a Stripe webhook endpoint:

`https://YOUR-VERCEL-DOMAIN/api/stripe-webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Copy the webhook signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` in Vercel and redeploy.

## Products

The storefront reads products from MongoDB. Use the site's **Add Product** button and enter the same `ADMIN_TOKEN` configured in Vercel. Product images are stored as data URLs and should be kept small (2 MB max).

## Security

The browser sends product IDs and quantities only. The checkout API loads prices from MongoDB and creates Stripe line items from those server-side prices. Never trust a price supplied by the browser.
