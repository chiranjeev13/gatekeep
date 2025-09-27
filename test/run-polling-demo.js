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
  url: "https://whatwasthatmeme.org/search?q=meme",
  interval: 1000, // 1 second - fast polling
  maxAttempts: 20, // More attempts for fast polling
  timeout: 5000, // 5 second timeout per request
};

// Polling state
let pollCount = 0;
let isPolling = false;
let pollInterval = null;

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

  try {
    // Generate payment signature
    const { signature, message } = await generatePaymentSignature(
      paymentRequirements
    );
    console.log("✅ Payment signature generated");

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

    // Post to facilitator settle endpoint
    const response = await axiosInstance.post(
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

    console.log("✅ Payment successful! Response:", response.data);
    return true;
  } catch (error) {
    console.log("❌ Payment failed:", error.response?.data || error.message);
    return false;
  }
}

// Create axios instance with timeout
const axiosInstance = axios.create({
  timeout: POLLING_CONFIG.timeout,
  headers: {
    "User-Agent": "Porus-Polling-Test/1.0",
  },
});

// Function to make a single request
async function makeRequest() {
  const attemptNumber = pollCount + 1;

  try {
    const response = await axiosInstance.get(POLLING_CONFIG.url);

    // Only log if we get a 402 status
    if (response.status === 402) {
      console.log(`\n🚨 402 Payment Required - Attempt #${attemptNumber}`);
      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      console.log(`🔗 Headers: ${JSON.stringify(response.headers, null, 2)}`);
      console.log(
        `📄 Response Data: ${JSON.stringify(response.data, null, 2)}`
      );

      // Automatically handle payment if paymentRequirements are present
      if (response.data.paymentRequirements) {
        const paymentSuccess = await handlePayment(
          response.data.paymentRequirements
        );
        if (paymentSuccess) {
          console.log(
            "🎉 Payment processed successfully! Continuing polling..."
          );
        }
      }
    } else {
      console.log(
        `✅ Success - Attempt #${attemptNumber} - Status: ${response.status}`
      );
    }
  } catch (error) {
    // Only log if we get a 402 error
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

      // Automatically handle payment if paymentRequirements are present
      if (error.response.data.paymentRequirements) {
        const paymentSuccess = await handlePayment(
          error.response.data.paymentRequirements
        );
        if (paymentSuccess) {
          console.log(
            "🎉 Payment processed successfully! Continuing polling..."
          );
        }
      }
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
}

// Main execution
// Start polling
startPolling();

// Set up graceful shutdown
process.on("SIGINT", () => {
  stopPolling();
  process.exit(0);
});
