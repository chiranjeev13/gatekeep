import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import axios from "axios";
import { polygonAmoy } from "viem/chains";

// Create a wallet client
const account = privateKeyToAccount(
  "0x72d99c45e8580b3d1b9d18bfd7ace47a0bd79eb29e78ef79fad0c9f2c50cdd25"
);
const client = createWalletClient({
  account,
  transport: http(),
  chain: polygonAmoy,
});

// Test data
const WALLET_ADDRESS = "0x376b7271dD22D14D82Ef594324ea14e7670ed5b2";
const USDC_CONTRACT = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
const AMOUNT = "100"; // 0.0001 USDC (6 decimals)
const BASE_URL = "http://localhost:8000";
const TEST_WEBSITE_URL = "https://example.com";

// Generate EIP-3009 signature for USDC transfer
async function generatePaymentSignature() {
  const domain = {
    name: "USDC",
    version: "2",
    chainId: 80002, // Polygon Amoy
    verifyingContract: USDC_CONTRACT as `0x${string}`,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = {
    from: account.address,
    to: WALLET_ADDRESS,
    value: AMOUNT,
    validAfter: "0", // Convert to string
    validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(), // Convert to string
    nonce: `0x${Math.random().toString(16).substr(2, 64).padEnd(64, "0")}`, // Random 32-byte nonce
  };

  const signature = await client.signTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  return { signature, message };
}

// Helper function to create payment payload and requirements
function createPaymentData() {
  return {
    paymentPayload: {
      x402Version: 1,
      scheme: "exact",
      network: "polygon-amoy",
      payload: {
        signature: "mock_signature",
        authorization: "mock_authorization",
        transaction:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      },
    },
    paymentRequirements: {
      scheme: "exact",
      network: "polygon-amoy",
      payTo: WALLET_ADDRESS,
      maxAmountRequired: AMOUNT,
      maxTimeoutSeconds: 3600,
      asset: USDC_CONTRACT,
      resource: `${BASE_URL}/api/premium`,
      description: "Premium API access",
      mimeType: "application/json",
    },
  };
}

// Test Health Endpoint
async function testHealthEndpoint() {
  console.log("\n🏥 Testing Health Endpoint...");
  try {
    const response = await axios.get(`${BASE_URL}/health`, {
      headers: {
        Origin: TEST_WEBSITE_URL,
      },
    });
    console.log("✅ Health endpoint response:", response.data);

    if (response.data.status === "healthy") {
      console.log("✅ Health check passed");
    } else {
      console.log("❌ Health check failed");
    }
  } catch (error: any) {
    console.log(
      "❌ Health endpoint error:",
      error.response?.data || error.message
    );
  }
}

// Test Authentication Status
async function testAuthStatus() {
  console.log("\n🔍 Testing Authentication Status...");
  try {
    const response = await axios.get(`${BASE_URL}/api/auth/status`, {
      headers: {
        Origin: TEST_WEBSITE_URL,
      },
    });
    console.log("✅ Auth status response:", response.data);

    if (typeof response.data.authenticated === "boolean") {
      console.log("✅ Auth status endpoint working");
    } else {
      console.log("❌ Auth status endpoint malformed");
    }
  } catch (error: any) {
    console.log("❌ Auth status error:", error.response?.data || error.message);
  }
}

// Test Logout Endpoint
async function testLogoutEndpoint() {
  console.log("\n🚪 Testing Logout Endpoint...");
  try {
    const response = await axios.post(
      `${BASE_URL}/api/logout`,
      {},
      {
        headers: {
          Origin: TEST_WEBSITE_URL,
        },
      }
    );
    console.log("✅ Logout response:", response.data);

    if (response.data.message === "Logged out successfully") {
      console.log("✅ Logout endpoint working");
    } else {
      console.log("❌ Logout endpoint malformed");
    }
  } catch (error: any) {
    console.log("❌ Logout error:", error.response?.data || error.message);
  }
}

// Test Protected Websites Management
async function testProtectedWebsitesManagement() {
  console.log("\n🌐 Testing Protected Websites Management...");

  // Test GET all protected websites
  console.log("\n1. Testing GET all protected websites...");
  try {
    const response = await axios.get(`${BASE_URL}/api/protected-websites`, {
      headers: {
        Origin: TEST_WEBSITE_URL,
      },
    });
    console.log("✅ GET protected websites response:", response.data);

    if (
      (response.data.success && Array.isArray(response.data.data)) ||
      typeof response.data.data === "object"
    ) {
      console.log("✅ GET protected websites working");
    } else {
      console.log("❌ GET protected websites malformed");
    }
  } catch (error: any) {
    console.log(
      "❌ GET protected websites error:",
      error.response?.data || error.message
    );
  }

  // Test POST new protected website
  console.log("\n2. Testing POST new protected website...");
  const newWebsite = {
    website: TEST_WEBSITE_URL,
    walletAddress: WALLET_ADDRESS,
    price: "100",
    network: "polygon-amoy",
    description: "Test website for payment protection",
  };

  try {
    const response = await axios.post(
      `${BASE_URL}/api/protected-websites`,
      newWebsite,
      {
        headers: {
          Origin: TEST_WEBSITE_URL,
        },
      }
    );
    console.log("✅ POST protected website response:", response.data);

    if (response.data.success && response.data.message) {
      console.log("✅ POST protected website working");
    } else {
      console.log("❌ POST protected website malformed");
    }
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log("✅ Website already exists (expected)");
    } else {
      console.log(
        "❌ POST protected website error:",
        error.response?.data || error.message
      );
    }
  }

  // Test GET specific protected website
  console.log("\n3. Testing GET specific protected website...");
  try {
    const response = await axios.get(
      `${BASE_URL}/api/protected-websites/${encodeURIComponent(
        TEST_WEBSITE_URL
      )}`,
      {
        headers: {
          Origin: TEST_WEBSITE_URL,
        },
      }
    );
    console.log("✅ GET specific website response:", response.data);

    if (response.data.success && response.data.data) {
      console.log("✅ GET specific website working");
    } else {
      console.log("❌ GET specific website malformed");
    }
  } catch (error: any) {
    console.log(
      "❌ GET specific website error:",
      error.response?.data || error.message
    );
  }

  // Test PUT update protected website
  console.log("\n4. Testing PUT update protected website...");
  const updateData = {
    price: "200",
    description: "Updated test website description",
  };

  try {
    const response = await axios.put(
      `${BASE_URL}/api/protected-websites/${encodeURIComponent(
        TEST_WEBSITE_URL
      )}`,
      updateData,
      {
        headers: {
          Origin: TEST_WEBSITE_URL,
        },
      }
    );
    console.log("✅ PUT update website response:", response.data);

    if (response.data.success && response.data.message) {
      console.log("✅ PUT update website working");
    } else {
      console.log("❌ PUT update website malformed");
    }
  } catch (error: any) {
    console.log(
      "❌ PUT update website error:",
      error.response?.data || error.message
    );
  }

  // Test DELETE protected website
  console.log("\n5. Testing DELETE protected website...");
  try {
    const response = await axios.delete(
      `${BASE_URL}/api/protected-websites/${encodeURIComponent(
        TEST_WEBSITE_URL
      )}`
    );
    console.log("✅ DELETE website response:", response.data);

    if (response.data.success && response.data.message) {
      console.log("✅ DELETE website working");
    } else {
      console.log("❌ DELETE website malformed");
    }
  } catch (error: any) {
    console.log(
      "❌ DELETE website error:",
      error.response?.data || error.message
    );
  }
}

// Test Premium Endpoints
async function testPremiumEndpoints() {
  console.log("\n💎 Testing Premium Endpoints...");

  // Test GET /api/premium without payment (should return 402)
  console.log("\n1. Testing GET /api/premium without payment...");
  try {
    const response = await axios.get(`${BASE_URL}/api/premium`);
    console.log("❌ Unexpected success without payment:", response.data);
  } catch (error: any) {
    if (error.response?.status === 402) {
      console.log("✅ Correctly returned 402 Payment Required");
      console.log(
        "Payment requirements:",
        error.response.data.paymentRequirements
      );
    } else {
      console.log(
        "❌ Unexpected error:",
        error.response?.data || error.message
      );
    }
  }

  // Test POST /api/premium with payment
  console.log("\n2. Testing POST /api/premium with payment...");
  const { paymentPayload, paymentRequirements } = createPaymentData();

  try {
    const response = await axios.post(
      `${BASE_URL}/api/premium`,
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
    console.log("✅ POST premium with payment response:", response.data);

    if (response.data.message && response.data.access_method) {
      console.log("✅ POST premium endpoint working");
    } else {
      console.log("❌ POST premium endpoint malformed");
    }
  } catch (error: any) {
    console.log(
      "❌ POST premium error:",
      error.response?.data || error.message
    );
  }

  // Test GET /api/premium/jwt (should require authentication)
  console.log("\n3. Testing GET /api/premium/jwt without auth...");
  try {
    const response = await axios.get(`${BASE_URL}/api/premium/jwt`);
    console.log("❌ Unexpected success without auth:", response.data);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log(
        "✅ Correctly returned 401 Unauthorized for JWT-only endpoint"
      );
    } else {
      console.log(
        "❌ Unexpected error:",
        error.response?.data || error.message
      );
    }
  }
}

// Test Payment Middleware with Real Signature
async function testPaymentMiddleware() {
  console.log("\n💰 Testing Payment Middleware with Real Signature...");

  // Generate real payment signature
  console.log("\n1. Generating real payment signature...");
  const { signature, message } = await generatePaymentSignature();
  console.log("✅ Real payment signature generated");

  // Create payment payload with real signature
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "polygon-amoy",
    payload: {
      signature,
      authorization: message,
      transaction:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
  };

  const paymentRequirements = {
    scheme: "exact",
    network: "polygon-amoy",
    payTo: WALLET_ADDRESS,
    maxAmountRequired: AMOUNT,
    maxTimeoutSeconds: 3600,
    asset: USDC_CONTRACT,
    resource: `${BASE_URL}/api/premium`,
    description: "Premium API access",
    mimeType: "application/json",
  };

  // Test direct settle endpoint
  // console.log("\n2. Testing direct settle endpoint...");
  // try {
  //   const settleResponse = await axios.post(
  //     "https://polygon-facilitator.vercel.app/settle",
  //     {
  //       paymentPayload,
  //       paymentRequirements,
  //     },
  //     {
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //     }
  //   );
  //   console.log("✅ Settle endpoint response:", settleResponse.data);
  // } catch (error: any) {
  //   console.log(
  //     "❌ Settle endpoint error:",
  //     error.response?.data || error.message
  //   );
  // }

  // Test /api/premium with real payment
  console.log("\n3. Testing /api/premium with real payment...");
  try {
    const response = await axios.post(
      `${BASE_URL}/api/premium`,
      {
        paymentPayload,
        paymentRequirements,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Origin: TEST_WEBSITE_URL,
        },
      }
    );
    console.log(
      "✅ Premium endpoint with real payment response:",
      response.data
    );
  } catch (error: any) {
    console.log(
      "❌ Premium endpoint with real payment error:",
      error.response?.data || error.message
    );
  }
}

// Test Error Handling
async function testErrorHandling() {
  console.log("\n🚨 Testing Error Handling...");

  // Test invalid website URL
  console.log("\n1. Testing invalid website URL...");
  try {
    const response = await axios.post(`${BASE_URL}/api/protected-websites`, {
      website: "invalid-url",
      walletAddress: WALLET_ADDRESS,
      price: "100",
      network: "polygon-amoy",
      description: "Test",
    });
    console.log("❌ Unexpected success with invalid URL:", response.data);
  } catch (error: any) {
    if (error.response?.status === 400) {
      console.log("✅ Correctly returned 400 for invalid URL");
    } else {
      console.log(
        "❌ Unexpected error:",
        error.response?.data || error.message
      );
    }
  }

  // Test missing required fields
  console.log("\n2. Testing missing required fields...");
  try {
    const response = await axios.post(`${BASE_URL}/api/protected-websites`, {
      website: TEST_WEBSITE_URL,
      // Missing other required fields
    });
    console.log("❌ Unexpected success with missing fields:", response.data);
  } catch (error: any) {
    if (error.response?.status === 400) {
      console.log("✅ Correctly returned 400 for missing fields");
    } else {
      console.log(
        "❌ Unexpected error:",
        error.response?.data || error.message
      );
    }
  }

  // Test non-existent website
  console.log("\n3. Testing non-existent website...");
  try {
    const response = await axios.get(
      `${BASE_URL}/api/protected-websites/${encodeURIComponent(
        "https://nonexistent.com"
      )}`
    );
    console.log(
      "❌ Unexpected success for non-existent website:",
      response.data
    );
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log("✅ Correctly returned 404 for non-existent website");
    } else {
      console.log(
        "❌ Unexpected error:",
        error.response?.data || error.message
      );
    }
  }
}

// Main test runner
async function runAllTests() {
  console.log("🚀 Starting Comprehensive Test Suite for Porus Service");
  console.log("=".repeat(60));

  try {
    // await testHealthEndpoint();
    // await testAuthStatus();
    // await testLogoutEndpoint();
    // await testProtectedWebsitesManagement();
    // await testPremiumEndpoints();
    await testPaymentMiddleware();
    // await testErrorHandling();

    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests completed!");
  } catch (error) {
    console.error("❌ Test suite failed:", error);
  }
}

// Run all tests
runAllTests().catch(console.error);
