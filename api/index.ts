
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import axios from "axios";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 8000;

// JWT secret - in production, use environment variables
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-jwt-key-change-in-production";

// Enable CORS for all origins and handle preflight
app.use(cors({ origin: "*", credentials: true }));

// Parse JSON bodies
app.use(express.json());

// Parse cookies
app.use(cookieParser());

// Your default wallet address to receive payments
const DEFAULT_WALLET_ADDRESS = "0x376b7271dD22D14D82Ef594324ea14e7670ed5b2";

// Path to the protected websites JSON file
const PROTECTED_WEBSITES_FILE = path.join(
  process.cwd(),
  "porus-service",
  "protected-websites.json"
);

// Interface for protected website configuration
interface ProtectedWebsite {
  walletAddress: string;
  price: string;
  network: string;
  config: {
    description: string;
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Load protected websites from JSON file
function loadProtectedWebsites(): Record<string, ProtectedWebsite> {
  try {
    if (fs.existsSync(PROTECTED_WEBSITES_FILE)) {
      const data = fs.readFileSync(PROTECTED_WEBSITES_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading protected websites:", error);
  }
  return {};
}

// Save protected websites to JSON file
function saveProtectedWebsites(
  websites: Record<string, ProtectedWebsite>
): void {
  try {
    fs.writeFileSync(
      PROTECTED_WEBSITES_FILE,
      JSON.stringify(websites, null, 2)
    );
  } catch (error) {
    console.error("Error saving protected websites:", error);
  }
}

// Get current protected websites
let protectedWebsites = loadProtectedWebsites();

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

// Custom middleware that checks auth first, then payment via settle endpoint
const authOrPaymentMiddleware = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Get the origin/referer to determine which website is making the request
  const origin = req.headers.origin || req.headers.referer;

  if (!origin) {
    return next(); // No origin/referer, continue without protection
  }

  // Extract the base URL (protocol + domain) from origin
  let websiteUrl: string;
  try {
    const url = new URL(origin);
    websiteUrl = `${url.protocol}//${url.host}`;
  } catch (error) {
    return next(); // Invalid URL, continue without protection
  }

  // Check if this website is protected
  const protectedWebsite =
    protectedWebsites[websiteUrl as keyof typeof protectedWebsites];

  if (!protectedWebsite || !protectedWebsite.enabled) {
    return next(); // Not a protected website or disabled, continue
  }

  // If user is already authenticated, serve content directly
  if (req.isAuthenticated) {
    console.log(
      `🔓 User already authenticated for ${websiteUrl}, serving content directly`
    );
    return next();
  }

  // Check if payment payload is present in request
  const { paymentPayload, paymentRequirements } = req.body || {};

  if (!paymentPayload || !paymentRequirements) {
    // Return 402 Payment Required with payment requirements
    return res.status(402).json({
      error: "Payment Required",
      paymentRequirements: {
        scheme: "exact",
        network: "polygon-amoy",
        payTo: protectedWebsite.walletAddress,
        maxAmountRequired: "100", // 0.0001 USDC (6 decimals)
        maxTimeoutSeconds: 3600,
        asset: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // USDC on Polygon Amoy
        resource: `https://localhost:${PORT}${req.path}`,
        description: protectedWebsite.config.description,
        mimeType: "application/json",
      },
    });
  }

  try {
    // Call the settle endpoint on the Polygon facilitator
    const settleResponse = await axios.post(
      "https://polygon-facilitator.vercel.app/settle",
      {
        paymentPayload,
        paymentRequirements,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // If settlement was successful, generate JWT token
    if (settleResponse.data.success === true) {
      try {
        const token = jwt.sign(
          {
            website: websiteUrl,
            paid: true,
            timestamp: new Date().toISOString(),
            price: protectedWebsite.price,
            settlementId:
              settleResponse.data.transactionHash || settleResponse.data.id,
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

        console.log(
          `🎟️ JWT token generated and set for ${websiteUrl} after successful settlement`
        );
        req.isAuthenticated = true;

        // Continue to the protected route
        return next();
      } catch (error) {
        console.error("Error generating JWT token:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else {
      return res.status(402).json({ error: "Payment settlement failed" });
    }
  } catch (error) {
    console.error("Settle endpoint error:", error);

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 500;
      const errorMessage =
        error.response?.data?.error || "Payment settlement failed";
      return res.status(statusCode).json({ error: errorMessage });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
};

// Apply middlewares in order
app.use(checkAuthToken);
app.use(authOrPaymentMiddleware);

// Protected Websites Management Routes
// GET /api/protected-websites - Get all protected websites
app.get("/api/protected-websites", (req, res) => {
  res.json({
    success: true,
    data: protectedWebsites,
    count: Object.keys(protectedWebsites).length,
  });
});

// GET /api/protected-websites/:website - Get specific protected website
app.get("/api/protected-websites/*", (req, res) => {
  const website = req.params[0];
  const websiteData = protectedWebsites[website];

  if (!websiteData) {
    return res.status(404).json({
      success: false,
      error: "Protected website not found",
    });
  }

  res.json({
    success: true,
    data: websiteData,
  });
});

// POST /api/protected-websites - Add new protected website
app.post("/api/protected-websites", (req, res) => {
  const { website, walletAddress, price, network, description } = req.body;

  // Validation
  if (!website || !walletAddress || !price || !network || !description) {
    return res.status(400).json({
      success: false,
      error:
        "Missing required fields: website, walletAddress, price, network, description",
    });
  }

  // Validate website URL format
  try {
    new URL(website);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: "Invalid website URL format",
    });
  }

  // Check if website already exists
  if (protectedWebsites[website]) {
    return res.status(409).json({
      success: false,
      error: "Website already exists",
    });
  }

  // Add new protected website
  const now = new Date().toISOString();
  protectedWebsites[website] = {
    walletAddress,
    price,
    network,
    config: {
      description,
    },
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  // Save to file
  saveProtectedWebsites(protectedWebsites);

  res.status(201).json({
    success: true,
    message: "Protected website added successfully",
    data: protectedWebsites[website],
  });
});

// PUT /api/protected-websites/:website - Update protected website
app.put("/api/protected-websites/*", (req, res) => {
  const website = req.params[0];
  const { walletAddress, price, network, description, enabled } = req.body;

  if (!protectedWebsites[website]) {
    return res.status(404).json({
      success: false,
      error: "Protected website not found",
    });
  }

  // Update fields if provided
  if (walletAddress !== undefined)
    protectedWebsites[website].walletAddress = walletAddress;
  if (price !== undefined) protectedWebsites[website].price = price;
  if (network !== undefined) protectedWebsites[website].network = network;
  if (description !== undefined)
    protectedWebsites[website].config.description = description;
  if (enabled !== undefined) protectedWebsites[website].enabled = enabled;

  protectedWebsites[website].updatedAt = new Date().toISOString();

  // Save to file
  saveProtectedWebsites(protectedWebsites);

  res.json({
    success: true,
    message: "Protected website updated successfully",
    data: protectedWebsites[website],
  });
});

// DELETE /api/protected-websites/:website - Delete protected website
app.delete("/api/protected-websites/*", (req, res) => {
  const website = req.params[0];

  if (!protectedWebsites[website]) {
    return res.status(404).json({
      success: false,
      error: "Protected website not found",
    });
  }

  delete protectedWebsites[website];

  // Save to file
  saveProtectedWebsites(protectedWebsites);

  res.json({
    success: true,
    message: "Protected website deleted successfully",
  });
});

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
    access_method: req.isAuthenticated
      ? "JWT Authentication"
      : "Direct Payment",
    premium_data: {
      insights: "Advanced analytics data",
      metrics: [87.3, 92.1, 78.5, 95.2],
      generated_at: new Date().toISOString(),
    },
    user: req.user || null,
  });
});

// Premium endpoint POST - handles payment and returns content
app.post("/api/premium", (req, res) => {
  res.json({
    message: "Premium content accessed via payment!",
    access_method: "Direct Payment",
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

// Start the server only in development
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`💰 Default wallet: ${DEFAULT_WALLET_ADDRESS}`);
    console.log(`✅ Health: http://localhost:${PORT}/health`);
    console.log(
      `💎 Premium (Auth or Pay): http://localhost:${PORT}/api/premium`
    );
    console.log(
      `🌐 Protected websites: ${Object.keys(protectedWebsites).join(", ")}`
    );
    console.log(`🔐 JWT Only: http://localhost:${PORT}/api/premium/jwt`);
    console.log(`🔍 Auth Status: http://localhost:${PORT}/api/auth/status`);
    console.log(`🚪 Logout: POST http://localhost:${PORT}/api/logout`);
    console.log(`\n📋 Protected Websites Management:`);
    console.log(`   GET    http://localhost:${PORT}/api/protected-websites`);
    console.log(`   POST   http://localhost:${PORT}/api/protected-websites`);
    console.log(
      `   PUT    http://localhost:${PORT}/api/protected-websites/{website}`
    );
    console.log(
      `   DELETE http://localhost:${PORT}/api/protected-websites/{website}`
    );
  });
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: any;
      isAuthenticated?: boolean;
    }
  }
}

// Export the app for Vercel
export default app;
