# PocketPay — editable source

This ZIP contains the current PocketPay fictional wallet interface source snapshot.

## Open in VS Code

1. Extract this ZIP.
2. Open the extracted folder in VS Code.
3. Run `npm install`.
4. Run `npm run dev` for the frontend development server.

## Important

The backend currently uses AppDeploy's `@appdeploy/sdk` for its database and storage. That means the full login/profile/balance functionality is designed to run on AppDeploy as it currently does.

For an independent free host such as Vercel/Render/Netlify, the backend needs to be migrated to a hosting-compatible database/API (for example a free PostgreSQL/Supabase-style setup). I have not replaced that backend with an external service because doing so would require service credentials and would change the current app's data model.

The current public AppDeploy deployment is:
https://pocketpay-demo-d0klh6.v2.appdeploy.ai/

This is a fictional wallet interface. It is not connected to real financial accounts or funds.

Admin demo credentials currently embedded in the AppDeploy backend:
username: admin
password: demo-1234

For any real deployment, change/remove those demo credentials and use proper server-side authentication and secrets.
