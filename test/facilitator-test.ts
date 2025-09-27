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
const AMOUNT = "500000"; // 0.5 USDC (6 decimals)

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

// Test the /api/premium endpoint
async function testPremiumEndpoint() {
  try {
    console.log("🧪 Testing /api/premium endpoint...");

    // First, try to access without payment (should return 402)
    console.log("\n1. Testing without payment (should return 402)...");
    const responseWithoutPayment = await axios.get(
      "http://localhost:8000/api/premium"
    );
    console.log(
      "❌ Unexpected success without payment:",
      responseWithoutPayment.data
    );
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

  // Generate payment signature
  console.log("\n2. Generating payment signature...");
  const { signature, message } = await generatePaymentSignature();
  console.log("✅ Payment signature generated");

  // Create payment payload and requirements
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "polygon-amoy",
    payload: {
      signature,
      authorization: message,
      transaction:
        "0x0000000000000000000000000000000000000000000000000000000000000000", // Placeholder transaction hash
    },
  };

  const paymentRequirements = {
    scheme: "exact",
    network: "polygon-amoy",
    payTo: WALLET_ADDRESS,
    maxAmountRequired: AMOUNT,
    maxTimeoutSeconds: 3600,
    asset: USDC_CONTRACT,
    resource: "http://localhost:8000/api/premium",
    description: "Premium API access",
    mimeType: "application/json",
  };

  // Test direct settle endpoint
  console.log("\n3. Testing direct settle endpoint...");
  try {
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
    console.log("✅ Settle endpoint response:", settleResponse.data);
  } catch (error: any) {
    console.log(
      "❌ Settle endpoint error:",
      error.response?.data || error.message
    );
  }

  // Test /api/premium with payment
  console.log("\n4. Testing /api/premium with payment...");
  try {
    const responseWithPayment = await axios.post(
      "http://localhost:8000/api/premium",
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
    console.log("✅ Premium endpoint response:", responseWithPayment.data);
  } catch (error: any) {
    console.log(
      "❌ Premium endpoint error:",
      error.response?.data || error.message
    );
  }
}

// Run the test
testPremiumEndpoint().catch(console.error);
