# Porus Service

A payment service with JWT authentication and protected websites functionality.

## Features

- JWT-based authentication
- Payment integration with Polygon facilitator
- Protected websites management with Firebase Firestore
- Express.js API server
- Vercel deployment ready

## Local Development

### Prerequisites
- Node.js 18+
- pnpm

### Installation

1. Install dependencies:
```bash
pnpm install --no-frozen-lockfile
```

2. Start development server:
```bash
pnpm dev
```

The server will start on `http://localhost:8000`

## API Endpoints

- `GET /health` - Health check
- `GET /api/premium` - Premium content (requires auth or payment)
- `POST /api/premium` - Premium content via payment
- `GET /api/premium/jwt` - JWT-only protected content
- `GET /api/auth/status` - Check authentication status
- `POST /api/logout` - Logout and clear JWT cookie
- `GET /api/protected-websites` - List all protected websites
- `POST /api/protected-websites` - Add new protected website
- `PUT /api/protected-websites/:website` - Update protected website
- `DELETE /api/protected-websites/:website` - Delete protected website

## Vercel Deployment

### Prerequisites
- Vercel CLI: `npm i -g vercel`
- Vercel account

### Deploy

1. Navigate to the porus-service directory:
```bash
cd porus-service
```

2. Deploy to Vercel:
```bash
vercel
```

3. Set environment variables in Vercel dashboard:
   - `JWT_SECRET`: Your JWT secret key
   - `NODE_ENV`: `production`
   - `FIREBASE_COLLECTION`: Collection name for protected websites (optional, defaults to 'protected-websites')

### Environment Variables

- `JWT_SECRET`: Secret key for JWT token signing (required)
- `NODE_ENV`: Environment mode (`development` or `production`)
- `FIREBASE_COLLECTION`: Firebase collection name for protected websites (optional)

## Configuration

Protected websites are stored in Firebase Firestore. Each website configuration includes:

- `walletAddress`: Wallet to receive payments
- `price`: Price for access
- `network`: Blockchain network
- `config.description`: Description of the service
- `enabled`: Whether the protection is active

## File Structure

```
porus-service/
├── index.ts                    # Main Express server
├── firebase.ts                 # Firebase configuration
├── protected-websites.json     # Sample configuration (not used in production)
├── types/
│   └── ambient.d.ts           # TypeScript ambient declarations
├── package.json               # Dependencies and scripts
├── pnpm-lock.yaml            # Lock file
├── tsconfig.json             # TypeScript configuration
├── vercel.json               # Vercel deployment config
├── .vercelignore             # Files to ignore in deployment
└── README.md                 # This file
```
