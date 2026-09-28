# PocketPay — editable source

PocketPay is a **fictional wallet interface**. It is not connected to real financial accounts, payment networks, banks, or real funds.

## Deployment architecture

- GitHub stores the source code.
- Vercel hosts the Vite frontend and `/api` serverless functions.
- Neon Postgres stores fictional accounts, profiles, and balances.

The laptop does **not** need to stay on for the deployed app to work.

## Required Vercel environment variables

- `DATABASE_URL` — provided by the Neon integration.
- `POCKETPAY_ADMIN_USERNAME` — your private admin username.
- `POCKETPAY_ADMIN_PASSWORD` — your private admin password.

Do not put these values in the Git repository.

## Local development

1. Run `npm install`.
2. Set the environment variables above.
3. Run `npm run dev`.

The database schema is created automatically the first time the API is called.
