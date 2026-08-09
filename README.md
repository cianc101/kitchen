# Kitchen

A mobile-first personal PWA for shopping, meals, recipes and pantry tracking.

## V1
- Shopping list with quantities and shops
- Check/uncheck shopping items
- Meal planning
- Recipes
- Pantry inventory and low-stock thresholds
- Cloudflare D1 storage
- Installable on iPhone Home Screen

## Cloudflare deployment
This project uses Wrangler automatic resource provisioning (Wrangler 4.45+). On first deploy, Cloudflare can create the D1 database from the binding in `wrangler.jsonc`. The `npm run deploy` script then applies the D1 migrations.

Use `npm run deploy` as the Cloudflare deploy command.

Before adding personal data, configure Cloudflare Access and replace `REPLACE_WITH_ACCESS_AUD` in `wrangler.jsonc` with the Access Application Audience tag. Production fails closed until Access is configured.
