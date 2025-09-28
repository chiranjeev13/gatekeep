import axios from "axios";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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

// Payment configuration
const USDC_CONTRACT = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

// Configuration for polling
const POLLING_CONFIG = {
  url: "https://whatwasthatmeme.org",
  interval: 1000, // 1 second - fast polling
  maxAttempts: 20, // More attempts for fast polling
  timeout: 30000, // 30 second timeout per request (increased for payment processing)
};

// Polling state
let pollCount = 0;
let isPolling = false;
let pollInterval = null;
let jwtToken = null; // Store JWT token for authenticated requests

// Generate EIP-3009 signature for USDC transfer
async function generatePaymentSignature(paymentRequirements) {
  const domain = {
    name: "USDC",
    version: "2",
    chainId: 80002, // Polygon Amoy
    verifyingContract: USDC_CONTRACT,
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
    to: paymentRequirements.payTo,
    value: paymentRequirements.maxAmountRequired,
    validAfter: "0",
    validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
    nonce: `0x${Math.random().toString(16).substr(2, 64).padEnd(64, "0")}`,
  };

  const signature = await client.signTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  return { signature, message };
}

// Function to handle payment when 402 is received
async function handlePayment(paymentRequirements) {
  console.log("\n💰 Processing payment automatically...");
  console.log(
    `📋 Payment Requirements:`,
    JSON.stringify(paymentRequirements, null, 2)
  );

  try {
    // Generate payment signature
    console.log(`🔐 Generating EIP-3009 signature...`);
    const { signature, message } = await generatePaymentSignature(
      paymentRequirements
    );
    console.log("✅ Payment signature generated");
    console.log(`📝 Signature: ${signature.substring(0, 20)}...`);
    console.log(`📄 Authorization message:`, JSON.stringify(message, null, 2));

    // Create payment payload
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

    console.log(
      `📦 Payment payload created:`,
      JSON.stringify(paymentPayload, null, 2)
    );

    // Make the payment request to the premium endpoint
    console.log(
      `🚀 Making payment request to: http://localhost:8000/api/premium`
    );
    const response = await axiosInstance.get(
      "http://localhost:8000/api/premium",
      {
        headers: {
          "x-payment-payload": JSON.stringify(paymentPayload),
          "x-payment-requirements": JSON.stringify(paymentRequirements),
          Origin: POLLING_CONFIG.url,
        },
      }
    );

    console.log(
      `📊 Payment response status: ${response.status} ${response.statusText}`
    );
    console.log("🍪 Response cookies:", response.headers);

    // Extract JWT token from cookies
    const accessTokenCookie = response.headers["set-cookie"]?.find((cookie) =>
      cookie.startsWith("access_token=")
    );

    let jwtToken = null;
    if (accessTokenCookie) {
      jwtToken = accessTokenCookie.split("access_token=")[1].split(";")[0];
      console.log("🔑 Extracted JWT Token:", jwtToken);
    } else {
      console.log("⚠️  No access_token cookie found in response");
    }

    console.log("✅ Payment successful! Response:", response.data);
    return { success: true, jwtToken };
  } catch (error) {
    console.log("❌ Payment failed:");
    console.log(
      `📊 Error status: ${error.response?.status} ${error.response?.statusText}`
    );
    console.log(`📄 Error data:`, error.response?.data || error.message);
    console.log(`🔗 Error headers:`, error.response?.headers);
    return { success: false, jwtToken: null };
  }
}

// Create axios instance with timeout
const axiosInstance = axios.create({
  timeout: POLLING_CONFIG.timeout,
});

// Function to make a single request
async function makeRequest() {
  const attemptNumber = pollCount + 1;

  try {
    // Prepare headers - include JWT token if we have one
    const headers = {
      "User-Agent": "Porus-Polling-Test/1.0",
    };

    if (jwtToken) {
      headers["Authorization"] = `Bearer ${jwtToken}`;
      console.log(`🔑 Using JWT token for attempt #${attemptNumber}`);
    }

    const response = await axiosInstance.get(POLLING_CONFIG.url, { headers });

    // Handle 402 Payment Required
    if (response.status === 402) {
      console.log(`\n🚨 402 Payment Required - Attempt #${attemptNumber}`);
      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      console.log(`🔗 Headers: ${JSON.stringify(response.headers, null, 2)}`);
      console.log(
        `📄 Response Data: ${JSON.stringify(response.data, null, 2)}`
      );

      // Stop polling when we hit 402
      console.log(`🛑 Stopping polling due to 402 Payment Required`);
      stopPolling();

      // Automatically handle payment if paymentRequirements are present
      if (response.data.paymentRequirements) {
        console.log(`💰 Processing payment for 402 response...`);
        const paymentResult = await handlePayment(
          response.data.paymentRequirements
        );
        if (paymentResult.success) {
          jwtToken = paymentResult.jwtToken; // Store the JWT token
          console.log("🎉 Payment processed successfully! JWT token stored.");
          console.log(`🔑 JWT Token: ${jwtToken}`);
        } else {
          console.log("❌ Payment failed. Demo ended.");
        }
      } else {
        console.log(
          "❌ No payment requirements found in 402 response. Demo ended."
        );
      }

      return; // Exit early after handling 402
    } else {
      console.log(
        `✅ Success - Attempt #${attemptNumber} - Status: ${response.status}`
      );
      if (jwtToken) {
        console.log(`🔓 Authenticated access successful with JWT token`);
      }
    }
  } catch (error) {
    // Handle 402 error from axios
    if (axios.isAxiosError(error) && error.response?.status === 402) {
      console.log(`\n🚨 402 Payment Required - Attempt #${attemptNumber}`);
      console.log(
        `📊 Status: ${error.response.status} ${error.response.statusText}`
      );
      console.log(
        `🔗 Headers: ${JSON.stringify(error.response.headers, null, 2)}`
      );
      console.log(
        `📄 Error Data: ${JSON.stringify(error.response.data, null, 2)}`
      );

      // Stop polling when we hit 402
      console.log(`🛑 Stopping polling due to 402 Payment Required`);
      stopPolling();

      // Automatically handle payment if paymentRequirements are present
      if (error.response.data.paymentRequirements) {
        console.log(`💰 Processing payment for 402 error...`);
        const paymentResult = await handlePayment(
          error.response.data.paymentRequirements
        );
        if (paymentResult.success) {
          jwtToken = paymentResult.jwtToken; // Store the JWT token
          console.log("🎉 Payment processed successfully! JWT token stored.");
          console.log(`🔑 JWT Token: ${jwtToken}`);
        } else {
          console.log("❌ Payment failed. Demo ended.");
        }
      } else {
        console.log(
          "❌ No payment requirements found in 402 error. Demo ended."
        );
      }

      return; // Exit early after handling 402
    } else {
      console.log(`❌ Error - Attempt #${attemptNumber}: ${error.message}`);
    }
  }

  pollCount++;
}

// Function to start polling
function startPolling() {
  if (isPolling) {
    return;
  }

  isPolling = true;
  pollCount = 0;

  // Make initial request immediately
  makeRequest();

  // Set up interval for subsequent requests
  pollInterval = setInterval(async () => {
    if (pollCount >= POLLING_CONFIG.maxAttempts) {
      stopPolling();
      return;
    }

    await makeRequest();
  }, POLLING_CONFIG.interval);
}

// Function to stop polling
function stopPolling() {
  if (!isPolling) {
    return;
  }

  isPolling = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  console.log(`\n🛑 Polling stopped after ${pollCount} attempts`);
  if (jwtToken) {
    console.log(`🔑 JWT token was active during polling`);
  }
}

// Main execution
console.log("🚀 Starting Porus Polling Demo");
console.log(`📡 Target URL: ${POLLING_CONFIG.url}`);
console.log(`⏱️  Polling interval: ${POLLING_CONFIG.interval}ms`);
console.log(`🔄 Max attempts: ${POLLING_CONFIG.maxAttempts}`);
console.log(`⏰ Timeout per request: ${POLLING_CONFIG.timeout}ms`);
console.log(`💰 USDC Contract: ${USDC_CONTRACT}`);
console.log(`🔑 Wallet Address: ${account.address}`);
console.log(`🌐 Network: Polygon Amoy (Chain ID: 80002)`);
console.log("=".repeat(50));
console.log(
  "📝 Note: Polling will stop automatically when 402 Payment Required is received"
);
console.log("=".repeat(50));

// Start polling
startPolling();

// Set up graceful shutdown
process.on("SIGINT", () => {
  stopPolling();
  process.exit(0);
});
