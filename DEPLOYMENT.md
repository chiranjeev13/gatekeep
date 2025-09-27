# Vercel Deployment Guide

## Prerequisites
1. Install Vercel CLI: `npm i -g vercel`
2. Make sure you have a Vercel account

## Deployment Steps

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Deploy to Vercel
```bash
vercel
```

### 3. Environment Variables
Set these environment variables in your Vercel dashboard:
- `JWT_SECRET`: Your JWT secret key for token signing
- `NODE_ENV`: Set to `production`

### 4. Custom Domain (Optional)
You can configure a custom domain in the Vercel dashboard.

## API Endpoints
Once deployed, your API will be available at:
- `https://your-app.vercel.app/health` - Health check
- `https://your-app.vercel.app/api/premium` - Premium content (requires auth or payment)
- `https://your-app.vercel.app/api/protected-websites` - Manage protected websites
- `https://your-app.vercel.app/api/auth/status` - Check authentication status

## File Structure
- `api/index.ts` - Main Express server (Vercel API route)
- `porus-service/protected-websites.json` - Protected websites configuration
- `vercel.json` - Vercel configuration
- `tsconfig.json` - TypeScript configuration

## Notes
- The server runs in serverless mode on Vercel
- File paths are adjusted for Vercel's environment
- The app only starts a local server in development mode
