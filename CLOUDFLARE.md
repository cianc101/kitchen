# Kitchen — Cloudflare resources

## Worker
- Worker name: `kitchen`
- Static assets: `public/`
- Worker entry point: `src/index.js`

## Required persistent resource

Create a D1 database named `kitchen-db` and bind it as `DB`.

After creation, add this to `wrangler.jsonc` using the database UUID Cloudflare provides:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "kitchen-db",
    "database_id": "<KITCHEN_D1_DATABASE_ID>"
  }
]
```

Apply `migrations/0001_initial.sql` to the remote database.

## Privacy
Kitchen is intended for personal household data. Put the production hostname behind Cloudflare Access if you do not want it publicly reachable.
