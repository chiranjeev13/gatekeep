"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="./types/ambient.d.ts" />
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const axios_1 = __importDefault(require("axios"));
const firebase_1 = require("./firebase");
const app = (0, express_1.default)();
const PORT = 8000;
// JWT secret - in production, use environment variables
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-jwt-key-change-in-production";
// Enable CORS for all origins and handle preflight
app.use((0, cors_1.default)({ origin: "*", credentials: true }));
// Parse JSON bodies
app.use(express_1.default.json());
// Parse cookies
app.use((0, cookie_parser_1.default)());
// Your default wallet address to receive payments
const DEFAULT_WALLET_ADDRESS = "0x376b7271dD22D14D82Ef594324ea14e7670ed5b2";
// Load protected websites from Firebase
async function loadProtectedWebsites() {
    try {
        const db = (0, firebase_1.getDb)();
        const websitesCollection = db.collection(firebase_1.COLLECTION_NAME);
        const querySnapshot = await websitesCollection.get();
        const websites = {};
        querySnapshot.forEach((doc) => {
            websites[doc.id] = doc.data();
        });
        return websites;
    }
    catch (error) {
        console.error("Error loading protected websites from Firebase:", error);
        return {};
    }
}
// Save protected website to Firebase
async function saveProtectedWebsite(websiteUrl, websiteData) {
    try {
        const db = (0, firebase_1.getDb)();
        const websiteDoc = db.collection(firebase_1.COLLECTION_NAME).doc(websiteUrl);
        await websiteDoc.set(websiteData);
    }
    catch (error) {
        console.error("Error saving protected website to Firebase:", error);
        throw error;
    }
}
// Delete protected website from Firebase
async function deleteProtectedWebsite(websiteUrl) {
    try {
        const db = (0, firebase_1.getDb)();
        const websiteDoc = db.collection(firebase_1.COLLECTION_NAME).doc(websiteUrl);
        await websiteDoc.delete();
    }
    catch (error) {
        console.error("Error deleting protected website from Firebase:", error);
        throw error;
    }
}
// Get specific protected website from Firebase
async function getProtectedWebsite(websiteUrl) {
    try {
        const db = (0, firebase_1.getDb)();
        const websiteDoc = db.collection(firebase_1.COLLECTION_NAME).doc(websiteUrl);
        const docSnap = await websiteDoc.get();
        if (docSnap.exists) {
            return docSnap.data();
        }
        return null;
    }
    catch (error) {
        console.error("Error getting protected website from Firebase:", error);
        return null;
    }
}
// Get current protected websites (cached for performance)
let protectedWebsites = {};
// JWT Authentication Middleware (non-blocking version)
const checkAuthToken = (req, res, next) => {
    // Try to get token from cookie first, then from Authorization header as fallback
    const token = req.cookies.access_token ||
        (req.headers["authorization"] &&
            req.headers["authorization"].split(" ")[1]);
    if (token) {
        jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
            if (!err) {
                req.user = user;
                req.isAuthenticated = true;
            }
        });
    }
    next();
};
// Blocking authentication middleware for routes that require valid JWT
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated) {
        return res
            .status(401)
            .json({ error: "Valid access token required" });
    }
    next();
};
// Custom middleware that checks auth first, then payment via settle endpoint
const authOrPaymentMiddleware = async (req, res, next) => {
    // Get the origin/referer to determine which website is making the request
    const origin = req.headers.origin || req.headers.referer;
    if (!origin) {
        return next(); // No origin/referer, continue without protection
    }
    // Extract the base URL (protocol + domain) from origin
    let websiteUrl;
    try {
        const url = new URL(origin);
        websiteUrl = `${url.protocol}//${url.host}`;
    }
    catch (error) {
        return next(); // Invalid URL, continue without protection
    }
    // Check if this website is protected
    const protectedWebsite = await getProtectedWebsite(websiteUrl);
    if (!protectedWebsite || !protectedWebsite.enabled) {
        return next(); // Not a protected website or disabled, continue
    }
    // If user is already authenticated, serve content directly
    if (req.isAuthenticated) {
        console.log(`🔓 User already authenticated for ${websiteUrl}, serving content directly`);
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
        const settleResponse = await axios_1.default.post("https://polygon-facilitator.vercel.app/settle", {
            paymentPayload,
            paymentRequirements,
        }, {
            headers: {
                "Content-Type": "application/json",
            },
        });
        // If settlement was successful, generate JWT token
        if (settleResponse.data.success === true) {
            try {
                const token = jsonwebtoken_1.default.sign({
                    website: websiteUrl,
                    paid: true,
                    timestamp: new Date().toISOString(),
                    price: protectedWebsite.price,
                    settlementId: settleResponse.data.transactionHash || settleResponse.data.id,
                }, JWT_SECRET, { expiresIn: "24h" });
                // Set JWT token as HTTP-only cookie with 24-hour expiration
                res.cookie("access_token", token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "lax",
                    maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
                });
                console.log(`🎟️ JWT token generated and set for ${websiteUrl} after successful settlement`);
                req.isAuthenticated = true;
                // Continue to the protected route
                return next();
            }
            catch (error) {
                console.error("Error generating JWT token:", error);
                return res
                    .status(500)
                    .json({ error: "Internal server error" });
            }
        }
        else {
            return res
                .status(402)
                .json({ error: "Payment settlement failed" });
        }
    }
    catch (error) {
        console.error("Settle endpoint error:", error);
        if (axios_1.default.isAxiosError(error)) {
            const statusCode = error.response?.status || 500;
            const errorMessage = error.response?.data?.error || "Payment settlement failed";
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
app.get("/api/protected-websites", async (req, res) => {
    try {
        const websites = await loadProtectedWebsites();
        res.json({
            success: true,
            data: websites,
            count: Object.keys(websites).length,
        });
    }
    catch (error) {
        console.error("Error fetching protected websites:", error);
        res.status(500).json({
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
            return res.status(404).json({
                success: false,
                error: "Protected website not found",
            });
        }
        res.json({
            success: true,
            data: websiteData,
        });
    }
    catch (error) {
        console.error("Error fetching protected website:", error);
        res.status(500).json({
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
            return res.status(400).json({
                success: false,
                error: "Missing required fields: website, walletAddress, price, network, description",
            });
        }
        // Validate website URL format
        try {
            new URL(website);
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: "Invalid website URL format",
            });
        }
        // Check if website already exists
        const existingWebsite = await getProtectedWebsite(website);
        if (existingWebsite) {
            return res.status(409).json({
                success: false,
                error: "Website already exists",
            });
        }
        // Add new protected website
        const now = new Date().toISOString();
        const websiteData = {
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
        // Save to Firebase
        await saveProtectedWebsite(website, websiteData);
        res.status(201).json({
            success: true,
            message: "Protected website added successfully",
            data: websiteData,
        });
    }
    catch (error) {
        console.error("Error adding protected website:", error);
        res.status(500).json({
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
            return res.status(404).json({
                success: false,
                error: "Protected website not found",
            });
        }
        // Update fields if provided
        const updatedWebsite = { ...existingWebsite };
        if (walletAddress !== undefined)
            updatedWebsite.walletAddress = walletAddress;
        if (price !== undefined)
            updatedWebsite.price = price;
        if (network !== undefined)
            updatedWebsite.network = network;
        if (description !== undefined)
            updatedWebsite.config.description = description;
        if (enabled !== undefined)
            updatedWebsite.enabled = enabled;
        updatedWebsite.updatedAt = new Date().toISOString();
        // Save to Firebase
        await saveProtectedWebsite(website, updatedWebsite);
        res.json({
            success: true,
            message: "Protected website updated successfully",
            data: updatedWebsite,
        });
    }
    catch (error) {
        console.error("Error updating protected website:", error);
        res.status(500).json({
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
            return res.status(404).json({
                success: false,
                error: "Protected website not found",
            });
        }
        // Delete from Firebase
        await deleteProtectedWebsite(website);
        res.json({
            success: true,
            message: "Protected website deleted successfully",
        });
    }
    catch (error) {
        console.error("Error deleting protected website:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete protected website",
        });
    }
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
        console.log(`💎 Premium (Auth or Pay): http://localhost:${PORT}/api/premium`);
        console.log(`🌐 Protected websites: Loaded from Firebase`);
        console.log(`🔐 JWT Only: http://localhost:${PORT}/api/premium/jwt`);
        console.log(`🔍 Auth Status: http://localhost:${PORT}/api/auth/status`);
        console.log(`🚪 Logout: POST http://localhost:${PORT}/api/logout`);
        console.log(`\n📋 Protected Websites Management:`);
        console.log(`   GET    http://localhost:${PORT}/api/protected-websites`);
        console.log(`   POST   http://localhost:${PORT}/api/protected-websites`);
        console.log(`   PUT    http://localhost:${PORT}/api/protected-websites/{website}`);
        console.log(`   DELETE http://localhost:${PORT}/api/protected-websites/{website}`);
    });
}
// Export the app for Vercel
exports.default = app;
