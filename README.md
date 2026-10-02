# Sprite Student Rewards

A production-oriented full-stack rebuild of the Sprite Student Rewards demo.

## Architecture

- `frontend`: React + Vite
- `backend`: Node.js + Express + Prisma
- Database: PostgreSQL
- Auth: JWT
- Payments: provider adapter interface with a development/mock provider
- Rewards: server-created 30-day eligibility timestamp
- Countdown: calculated from server `eligibleAt`; browser clock is never trusted for eligibility

## Product rules copied from the demo

| Product | Price | Reward after 30 days |
|---|---:|---:|
| Sprite 500ml | 2,000 RWF | 15,000 RWF |
| Sprite 1L | 5,000 RWF | 25,000 RWF |
| Sprite Family Pack | 10,000 RWF | 50,000 RWF |

## Run locally

### 1. Database

Create a PostgreSQL database, then copy:

`backend/.env.example` -> `backend/.env`

Set `DATABASE_URL` and `JWT_SECRET`.

### 2. Backend

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run dev
```

The API runs on `http://localhost:4000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on the Vite URL shown in the terminal.

For local development, the frontend uses `/api` and Vite proxies it to the backend.

## Important payment behavior

The included `mock` provider is deliberately safe for development. It does not move real money.

The production payment flow is:

1. Frontend asks backend to create an order.
2. Backend validates product, quantity and authenticated user.
3. Backend creates a payment request through a provider adapter.
4. Provider callback/webhook reaches backend.
5. Backend verifies the transaction with the provider.
6. Backend marks the order `PAID` exactly once.
7. Backend creates a reward with `eligibleAt = confirmedAt + 30 days`.
8. Frontend polls/refreshes reward data and displays the remaining days/hours/minutes/seconds.
9. When time reaches zero, the backend—not the browser—decides the reward is claimable.

Do not put payment PINs, provider secrets, or webhook secrets in the frontend.

## Deployment

GitHub should contain the source code and CI/CD configuration. The database, backend and frontend should be deployed to suitable hosting providers. GitHub Pages alone is not sufficient for this complete application.
