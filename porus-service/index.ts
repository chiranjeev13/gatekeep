/// <reference path="./types/ambient.d.ts" />
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import axios from "axios";
import fs from "fs/promises";
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

// Path to the JSON file for storing protected websites
const PROTECTED_WEBSITES_FILE = path.join(
  process.cwd(),
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

// Initialize the JSON file if it doesn't exist
async function initializeJsonFile(): Promise<void> {
  try {
    await fs.access(PROTECTED_WEBSITES_FILE);
  } catch (error) {
    // File doesn't exist, create it with empty object
    await fs.writeFile(PROTECTED_WEBSITES_FILE, JSON.stringify({}, null, 2));
    console.log(
      `📄 Created new protected websites file: ${PROTECTED_WEBSITES_FILE}`
    );
  }
}

// Load protected websites from JSON file
async function loadProtectedWebsites(): Promise<
  Record<string, ProtectedWebsite>
> {
  try {
    await initializeJsonFile();
    const data = await fs.readFile(PROTECTED_WEBSITES_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading protected websites from JSON file:", error);
    return {};
  }
}

// Save protected websites to JSON file
async function saveProtectedWebsites(
  websites: Record<string, ProtectedWebsite>
): Promise<void> {
  try {
    await fs.writeFile(
      PROTECTED_WEBSITES_FILE,
      JSON.stringify(websites, null, 2)
    );
  } catch (error) {
    console.error("Error saving protected websites to JSON file:", error);
    throw error;
  }
}

// Save protected website to JSON file
async function saveProtectedWebsite(
  websiteUrl: string,
  websiteData: ProtectedWebsite
): Promise<void> {
  try {
    const websites = await loadProtectedWebsites();
    websites[websiteUrl] = websiteData;
    await saveProtectedWebsites(websites);
  } catch (error) {
    console.error("Error saving protected website to JSON file:", error);
    throw error;
  }
}

// Delete protected website from JSON file
async function deleteProtectedWebsite(websiteUrl: string): Promise<void> {
  try {
    const websites = await loadProtectedWebsites();
    delete websites[websiteUrl];
    await saveProtectedWebsites(websites);
  } catch (error) {
    console.error("Error deleting protected website from JSON file:", error);
    throw error;
  }
}

// Get specific protected website from JSON file
async function getProtectedWebsite(
  websiteUrl: string
): Promise<ProtectedWebsite | null> {
  try {
    const websites = await loadProtectedWebsites();
    return websites[websiteUrl] || null;
  } catch (error) {
    console.error("Error getting protected website from JSON file:", error);
    return null;
  }
}

// Get current protected websites (cached for performance)
let protectedWebsites: Record<string, ProtectedWebsite> = {};

// JWT Authentication Middleware (non-blocking version)
const checkAuthToken = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.log(
    `🔍 [checkAuthToken] Processing request to ${req.method} ${req.path}`
  );

  // Try to get token from cookie first, then from Authorization header as fallback
  const token =
    req.cookies.access_token ||
    (req.headers["authorization"] &&
      req.headers["authorization"].split(" ")[1]);

  if (token) {
    console.log(`🎟️ [checkAuthToken] Token found, verifying...`);
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (!err) {
        (req as any).user = user;
        (req as any).isAuthenticated = true;
        console.log(
          `✅ [checkAuthToken] Token verified successfully for user:`,
          user
        );
      } else {
        console.log(
          `❌ [checkAuthToken] Token verification failed:`,
          err.message
        );
      }
    });
  } else {
    console.log(`🚫 [checkAuthToken] No token found in request`);
  }

  next();
};

// Blocking authentication middleware for routes that require valid JWT
const requireAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.log(
    `🔐 [requireAuth] Checking authentication for ${req.method} ${req.path}`
  );

  if (!(req as any).isAuthenticated) {
    console.log(
      `❌ [requireAuth] Authentication required but user not authenticated`
    );
    return (res as any)
      .status(401)
      .json({ error: "Valid access token required" });
  }

  console.log(`✅ [requireAuth] User authenticated, proceeding to route`);
  next();
};

// Custom middleware that checks auth first, then payment via settle endpoint
const authOrPaymentMiddleware = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.log(
    `💰 [authOrPaymentMiddleware] Processing request to ${req.method} ${req.path}`
  );

  // Get the origin/referer to determine which website is making the request
  const origin = req.headers.origin || req.headers.referer;

  console.log(`🌐 [authOrPaymentMiddleware] Origin:`, origin);

  if (!origin) {
    console.log(
      `⚠️ [authOrPaymentMiddleware] No origin/referer found, checking for authentication or payment`
    );

    // If no origin but user is authenticated, allow access
    if ((req as any).isAuthenticated) {
      console.log(
        `🔓 [authOrPaymentMiddleware] User authenticated without origin, serving content`
      );
      return next();
    }

    // If no origin and no authentication, require payment
    const paymentPayload = req.headers["x-payment-payload"];
    const paymentRequirements = req.headers["x-payment-requirements"];

    if (!paymentPayload || !paymentRequirements) {
      console.log(
        `💸 [authOrPaymentMiddleware] No origin, no auth, no payment - returning 402 Payment Required`
      );
      return (res as any).status(402).json({
        error: "Payment Required",
        paymentRequirements: {
          scheme: "exact",
          network: "polygon-amoy",
          payTo: DEFAULT_WALLET_ADDRESS,
          maxAmountRequired: "100", // 0.0001 USDC (6 decimals)
          maxTimeoutSeconds: 3600,
          asset: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // USDC on Polygon Amoy
          resource: `https://localhost:${PORT}${(req as any).path}`,
          description: "Premium content access",
          mimeType: "application/json",
        },
      });
    }

    // If payment is provided, continue to payment verification
    console.log(
      `💳 [authOrPaymentMiddleware] Payment provided without origin, proceeding to verification`
    );
  }

  // Extract the base URL (protocol + domain) from origin
  let websiteUrl: string;
  try {
    const url = new URL(origin);
    websiteUrl = `${url.protocol}//${url.host}`;
    console.log(
      `🔗 [authOrPaymentMiddleware] Extracted website URL:`,
      websiteUrl
    );
  } catch (error) {
    console.log(
      `❌ [authOrPaymentMiddleware] Invalid URL format, continuing without protection:`,
      error
    );
    return next(); // Invalid URL, continue without protection
  }

  // Check if this website is protected
  const protectedWebsite = await getProtectedWebsite(websiteUrl);

  if (!protectedWebsite || !protectedWebsite.enabled) {
    console.log(
      `🔓 [authOrPaymentMiddleware] Website not protected or disabled, continuing without protection`
    );
    return (next as any)(); // Not a protected website or disabled, continue
  }

  console.log(
    `🛡️ [authOrPaymentMiddleware] Protected website found:`,
    protectedWebsite
  );
  console.log(
    `🔐 [authOrPaymentMiddleware] User authenticated:`,
    (req as any).isAuthenticated
  );

  // If user is already authenticated, serve content directly
  if ((req as any).isAuthenticated) {
    console.log(
      `🔓 [authOrPaymentMiddleware] User already authenticated for ${websiteUrl}, serving content directly`
    );
    return (next as any)();
  }

  // Check if payment payload is present in request headers
  const paymentPayload = req.headers["x-payment-payload"];
  const paymentRequirements = req.headers["x-payment-requirements"];

  console.log(`💳 [authOrPaymentMiddleware] Checking for payment payload...`);
  console.log(
    `💳 [authOrPaymentMiddleware] Payment payload present:`,
    !!paymentPayload
  );
  console.log(
    `💳 [authOrPaymentMiddleware] Payment requirements present:`,
    !!paymentRequirements
  );

  if (!paymentPayload || !paymentRequirements) {
    console.log(
      `💸 [authOrPaymentMiddleware] No payment found, returning 402 Payment Required`
    );
    // Return 402 Payment Required with payment requirements
    return (res as any).status(402).json({
      error: "Payment Required",
      paymentRequirements: {
        scheme: "exact",
        network: "polygon-amoy",
        payTo: protectedWebsite.walletAddress,
        maxAmountRequired: "100", // 0.0001 USDC (6 decimals)
        maxTimeoutSeconds: 3600,
        asset: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // USDC on Polygon Amoy
        resource: `https://localhost:${PORT}${(req as any).path}`,
        description: protectedWebsite.config.description,
        mimeType: "application/json",
      },
    });
  }

  try {
    console.log(
      `🔄 [authOrPaymentMiddleware] Calling settle endpoint for payment verification...`
    );

    // Parse header values as JSON
    let parsedPaymentPayload, parsedPaymentRequirements;
    try {
      parsedPaymentPayload =
        typeof paymentPayload === "string"
          ? JSON.parse(paymentPayload)
          : paymentPayload;
      parsedPaymentRequirements =
        typeof paymentRequirements === "string"
          ? JSON.parse(paymentRequirements)
          : paymentRequirements;
    } catch (parseError) {
      console.error(
        `❌ [authOrPaymentMiddleware] Error parsing payment headers:`,
        parseError
      );
      return (res as any)
        .status(400)
        .json({ error: "Invalid payment data format" });
    }

    // Call the settle endpoint on the Polygon facilitator
    const settleResponse = await axios.post(
      "https://polygon-facilitator.vercel.app/settle",
      {
        paymentPayload: parsedPaymentPayload,
        paymentRequirements: parsedPaymentRequirements,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `📊 [authOrPaymentMiddleware] Settle response:`,
      settleResponse.data
    );

    // If settlement was successful, generate JWT token
    if (settleResponse.data.success === true) {
      console.log(
        `✅ [authOrPaymentMiddleware] Payment settlement successful, generating JWT token...`
      );

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
        (res as any).cookie("access_token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        });

        console.log(
          `🎟️ [authOrPaymentMiddleware] JWT token generated and set for ${websiteUrl} after successful settlement`
        );
        (req as any).isAuthenticated = true;

        // Continue to the protected route
        return (next as any)();
      } catch (error) {
        console.error(
          `❌ [authOrPaymentMiddleware] Error generating JWT token:`,
          error
        );
        return (res as any)
          .status(500)
          .json({ error: "Internal server error" });
      }
    } else {
      console.log(`❌ [authOrPaymentMiddleware] Payment settlement failed`);
      return (res as any)
        .status(402)
        .json({ error: "Payment settlement failed" });
    }
  } catch (error) {
    console.error(`❌ [authOrPaymentMiddleware] Settle endpoint error:`, error);

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 500;
      const errorMessage =
        error.response?.data?.error || "Payment settlement failed";
      console.log(
        `❌ [authOrPaymentMiddleware] Axios error - Status: ${statusCode}, Message: ${errorMessage}`
      );
      return (res as any).status(statusCode).json({ error: errorMessage });
    }

    console.log(`❌ [authOrPaymentMiddleware] Unknown error occurred`);
    return (res as any).status(500).json({ error: "Internal server error" });
  }
};

// Apply checkAuthToken middleware to all routes
app.use(checkAuthToken);

// Protected Websites Management Routes
// GET /api/protected-websites - Get all protected websites
app.get("/api/protected-websites", async (req, res) => {
  try {
    const websites = await loadProtectedWebsites();
    (res as any).json({
      success: true,
      data: websites,
      count: Object.keys(websites).length,
    });
  } catch (error) {
    console.error("Error fetching protected websites:", error);
    (res as any).status(500).json({
      success: false,
      error: "Failed to fetch protected websites",
    });
  }
});

// GET /api/protected-websites/:website - Get specific protected website
app.get("/api/protected-websites/:website", async (req, res) => {
  try {
    const website = req.params.website;
    const websiteData = await getProtectedWebsite(website);

    if (!websiteData) {
      return (res as any).status(404).json({
        success: false,
        error: "Protected website not found",
      });
    }

    (res as any).json({
      success: true,
      data: websiteData,
    });
  } catch (error) {
    console.error("Error fetching protected website:", error);
    (res as any).status(500).json({
      success: false,
      error: "Failed to fetch protected website",
    });
  }
});

// POST /api/protected-websites - Add new protected website
app.post("/api/protected-websites", async (req, res) => {
  try {
    const { website, walletAddress, price, network, description } = req.body;

    // Validation
    if (!website || !walletAddress || !price || !network || !description) {
      return (res as any).status(400).json({
        success: false,
        error:
          "Missing required fields: website, walletAddress, price, network, description",
      });
    }

    // Validate website URL format
    try {
      new URL(website);
    } catch (error) {
      return (res as any).status(400).json({
        success: false,
        error: "Invalid website URL format",
      });
    }

    // Check if website already exists
    const existingWebsite = await getProtectedWebsite(website);
    if (existingWebsite) {
      return (res as any).status(409).json({
        success: false,
        error: "Website already exists",
      });
    }

    // Add new protected website
    const now = new Date().toISOString();
    const websiteData: ProtectedWebsite = {
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

    // Save to JSON file
    await saveProtectedWebsite(website, websiteData);

    (res as any).status(201).json({
      success: true,
      message: "Protected website added successfully",
      data: websiteData,
    });
  } catch (error) {
    console.error("Error adding protected website:", error);
    (res as any).status(500).json({
      success: false,
      error: "Failed to add protected website",
    });
  }
});

// PUT /api/protected-websites/:website - Update protected website
app.put("/api/protected-websites/:website", async (req, res) => {
  try {
    const website = req.params.website;
    const { walletAddress, price, network, description, enabled } = req.body;

    const existingWebsite = await getProtectedWebsite(website);
    if (!existingWebsite) {
      return (res as any).status(404).json({
        success: false,
        error: "Protected website not found",
      });
    }

    // Update fields if provided
    const updatedWebsite = { ...existingWebsite };
    if (walletAddress !== undefined)
      updatedWebsite.walletAddress = walletAddress;
    if (price !== undefined) updatedWebsite.price = price;
    if (network !== undefined) updatedWebsite.network = network;
    if (description !== undefined)
      updatedWebsite.config.description = description;
    if (enabled !== undefined) updatedWebsite.enabled = enabled;

    updatedWebsite.updatedAt = new Date().toISOString();

    // Save to JSON file
    await saveProtectedWebsite(website, updatedWebsite);

    (res as any).json({
      success: true,
      message: "Protected website updated successfully",
      data: updatedWebsite,
    });
  } catch (error) {
    console.error("Error updating protected website:", error);
    (res as any).status(500).json({
      success: false,
      error: "Failed to update protected website",
    });
  }
});

// DELETE /api/protected-websites/:website - Delete protected website
app.delete("/api/protected-websites/:website", async (req, res) => {
  try {
    const website = req.params.website;

    const existingWebsite = await getProtectedWebsite(website);
    if (!existingWebsite) {
      return (res as any).status(404).json({
        success: false,
        error: "Protected website not found",
      });
    }

    // Delete from JSON file
    await deleteProtectedWebsite(website);

    (res as any).json({
      success: true,
      message: "Protected website deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting protected website:", error);
    (res as any).status(500).json({
      success: false,
      error: "Failed to delete protected website",
    });
  }
});

// Health endpoint - no payment required
app.get("/health", (req, res) => {
  (res as any).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    authenticated: !!(req as any).isAuthenticated,
  });
});

// Premium endpoint GET - handles authentication and payment via headers
app.get("/api/premium", authOrPaymentMiddleware, (req, res) => {
  // Check if user is authenticated (either via JWT or payment verification)
  if (!(req as any).isAuthenticated) {
    console.log("❌ [GET /api/premium] User not authenticated, returning 402");
    return (res as any).status(402).json({
      error: "Payment Required",
      message: "Authentication or payment required to access premium content",
    });
  }

  console.log("✅ Premium content accessed via GET with headers!");
  (res as any).json({
    message: "Premium content accessed via GET with headers!",
    access_method: (req as any).isAuthenticated
      ? "JWT Authentication"
      : "Direct Payment",
    premium_data: {
      insights: "Advanced analytics data",
      metrics: [87.3, 92.1, 78.5, 95.2],
      generated_at: new Date().toISOString(),
    },
    user: (req as any).user || null,
  });
});

// JWT-only protected route - requires valid JWT token (no payment option)
app.get("/api/premium/jwt", requireAuth, (req, res) => {
  (res as any).json({
    message: "Premium content accessed via JWT only!",
    premium_data: {
      insights: "Advanced analytics data",
      metrics: [87.3, 92.1, 78.5, 95.2],
      generated_at: new Date().toISOString(),
      user: (req as any).user,
    },
  });
});

// Check authentication status
app.get("/api/auth/status", (req, res) => {
  (res as any).json({
    authenticated: !!(req as any).isAuthenticated,
    user: (req as any).user || null,
  });
});

// Logout endpoint - clears the JWT cookie
app.post("/api/logout", (req, res) => {
  (res as any).clearCookie("access_token");
  (res as any).json({ message: "Logged out successfully" });
});

// Initialize the JSON file on startup
initializeJsonFile().then(() => {
  console.log("✅ Protected websites JSON file initialized");
});

// Start the server only in development
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`💰 Default wallet: ${DEFAULT_WALLET_ADDRESS}`);
    console.log(`📄 JSON storage: ${PROTECTED_WEBSITES_FILE}`);
    console.log(`✅ Health: http://localhost:${PORT}/health`);
    console.log(
      `💎 Premium (Auth or Pay): http://localhost:${PORT}/api/premium`
    );
    console.log(`🌐 Protected websites: Loaded from JSON file`);
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

// Export the app for Vercel
export default app;
