/// <reference path="./types/ambient.d.ts" />
import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";

import { createFacilitatorConfig } from "@coinbase/x402";

const facilitator = createFacilitatorConfig(
  "c3ed6b90-f361-4071-898f-594001704263",
  "/Jl0k7Mz2zPMxPI6LKV7UT0uWbW/Yiwh+zixrvqDuk369oLE8ELRmNijyeDD+FklijEI4+OTb0vM+kxz33xaSA==",
  // 'http://localhost:3002'
); // Pass in directly from preferred secret management

const app = express();
const PORT = 8000;

// Enable CORS for all origins and handle preflight
app.use(cors({ origin: "*" }));

// Your wallet address to receive payments
const WALLET_ADDRESS = "0x376b7271dD22D14D82Ef594324ea14e7670ed5b2";

// Configure protected route with price
const protectedRoutes = {
  "/api/premium": {
    price: "$0.00010",
    network: "base-sepolia",
    config: {
      description: "Premium API access",
    },
  },
};

// Apply x402 payment middleware
app.use(
  paymentMiddleware(WALLET_ADDRESS, protectedRoutes, facilitator)
);

// Health endpoint - no payment required
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Protected route - requires $0.10 payment
app.get("/api/premium", (req, res) => {
  // console.log('headers', req.headers)
  res.json({
    message: "Premium content accessed!",
    premium_data: {
      insights: "Advanced analytics data",
      metrics: [87.3, 92.1, 78.5, 95.2],
      generated_at: new Date().toISOString(),
    },
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`💰 Payments to: ${WALLET_ADDRESS}`);
  console.log(`✅ Health: http://localhost:${PORT}/health`);
  console.log(`💎 Premium ($0.10): http://localhost:${PORT}/api/premium`);
});
