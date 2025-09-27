/// <reference path="./types/ambient.d.ts" />
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { paymentMiddleware } from "x402-express";

import { createFacilitatorConfig } from "@coinbase/x402";

const facilitator = createFacilitatorConfig(
  "c3ed6b90-f361-4071-898f-594001704263",
  "/Jl0k7Mz2zPMxPI6LKV7UT0uWbW/Yiwh+zixrvqDuk369oLE8ELRmNijyeDD+FklijEI4+OTb0vM+kxz33xaSA=="
  // 'http://localhost:3002'
); // Pass in directly from preferred secret management

const app = express();
const PORT = 8000;

// JWT secret - in production, use environment variables
const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";

// Enable CORS for all origins and handle preflight
app.use(cors({ origin: "*", credentials: true }));

// Parse cookies
app.use(cookieParser());

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

// JWT Authentication Middleware (non-blocking version)
const checkAuthToken = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Try to get token from cookie first, then from Authorization header as fallback
  const token =
    req.cookies.access_token ||
    (req.headers["authorization"] &&
      req.headers["authorization"].split(" ")[1]);

  if (token) {
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (!err) {
        req.user = user;
        req.isAuthenticated = true;
      }
    });
  }
  
  next();
};

// Blocking authentication middleware for routes that require valid JWT
const requireAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (!req.isAuthenticated) {
    return res.status(401).json({ error: "Valid access token required" });
  }
  next();
};

// Custom middleware that checks auth first, then payment
const authOrPaymentMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Check if this is a protected route
  const route = req.path;
  const protectedRoute = protectedRoutes[route as keyof typeof protectedRoutes];

  if (!protectedRoute) {
    return next(); // Not a protected route, continue
  }

  // If user is already authenticated, serve content directly
  if (req.isAuthenticated) {
    console.log(`🔓 User already authenticated for ${route}, serving content directly`);
    return next();
  }

  console.log(`💳 No valid auth found for ${route}, requiring payment`);
  
  // User not authenticated, apply payment middleware
  return paymentMiddleware(WALLET_ADDRESS, protectedRoutes, facilitator)(req, res, (err) => {
    if (err) return next(err);
    
    // If payment was successful, generate JWT token
    if (res.statusCode !== 402) { // 402 = Payment Required
      try {
        const token = jwt.sign(
          {
            route: route,
            paid: true,
            timestamp: new Date().toISOString(),
            price: protectedRoute.price,
          },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        // Set JWT token as HTTP-only cookie with 24-hour expiration
        res.cookie("access_token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        });

        console.log(`🎟️ JWT token generated and set for ${route}`);
        req.isAuthenticated = true;
      } catch (error) {
        console.error("Error generating JWT token:", error);
      }
    }
    
    next();
  });
};

// Apply middlewares in order
app.use(checkAuthToken); // First check for existing auth
app.use(authOrPaymentMiddleware); // Then check auth or require payment for protected routes

// Health endpoint - no payment required
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    authenticated: !!req.isAuthenticated,
  });
});

// Premium endpoint - requires authentication (via existing JWT or payment)
app.get("/api/premium", (req, res) => {
  res.json({
    message: "Premium content accessed!",
    access_method: req.isAuthenticated ? "JWT Authentication" : "Direct Payment",
    premium_data: {
      insights: "Advanced analytics data",
      metrics: [87.3, 92.1, 78.5, 95.2],
      generated_at: new Date().toISOString(),
    },
    user: req.user || null,
  });
});

// JWT-only protected route - requires valid JWT token (no payment option)
app.get("/api/premium/jwt", requireAuth, (req, res) => {
  res.json({
    message: "Premium content accessed via JWT only!",
    premium_data: {
      insights: "Advanced analytics data",
      metrics: [87.3, 92.1, 78.5, 95.2],
      generated_at: new Date().toISOString(),
      user: req.user,
    },
  });
});

// Check authentication status
app.get("/api/auth/status", (req, res) => {
  res.json({
    authenticated: !!req.isAuthenticated,
    user: req.user || null,
  });
});

// Logout endpoint - clears the JWT cookie
app.post("/api/logout", (req, res) => {
  res.clearCookie("access_token");
  res.json({ message: "Logged out successfully" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`💰 Payments to: ${WALLET_ADDRESS}`);
  console.log(`✅ Health: http://localhost:${PORT}/health`);
  console.log(`💎 Premium (Auth or Pay): http://localhost:${PORT}/api/premium`);
  console.log(`🔐 JWT Only: http://localhost:${PORT}/api/premium/jwt`);
  console.log(`🔍 Auth Status: http://localhost:${PORT}/api/auth/status`);
  console.log(`🚪 Logout: POST http://localhost:${PORT}/api/logout`);
});

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: any;
      isAuthenticated?: boolean;
    }
  }
}