import axios from "axios";

// Configuration for polling
const POLLING_CONFIG = {
  url: "https://whatwasthatmeme.org/search?q=meme",
  interval: 5000, // 5 seconds
  maxAttempts: 10, // Stop after 10 attempts
  timeout: 10000, // 10 second timeout per request
};

// Polling state
let pollCount = 0;
let isPolling = false;
let pollInterval: NodeJS.Timeout | null = null;

// Create axios instance with timeout
const axiosInstance = axios.create({
  timeout: POLLING_CONFIG.timeout,
  headers: {
    "User-Agent": "Porus-Polling-Test/1.0",
  },
});

// Function to make a single request
async function makeRequest(): Promise<void> {
  const attemptNumber = pollCount + 1;
  const timestamp = new Date().toISOString();

  console.log(`\n🔄 [${timestamp}] Polling attempt #${attemptNumber}`);
  console.log(`📡 Making request to: ${POLLING_CONFIG.url}`);

  try {
    const startTime = Date.now();
    const response = await axiosInstance.get(POLLING_CONFIG.url);
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✅ [${timestamp}] Request successful!`);
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(
      `📏 Content length: ${response.data?.length || "Unknown"} characters`
    );
    console.log(`🔗 Headers: ${JSON.stringify(response.headers, null, 2)}`);

    // Log a snippet of the response data
    if (response.data) {
      const dataString =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);
      const snippet = dataString.substring(0, 200);
      console.log(
        `📄 Response snippet: ${snippet}${dataString.length > 200 ? "..." : ""}`
      );
    }
  } catch (error) {
    console.log(`❌ [${timestamp}] Request failed!`);

    if (axios.isAxiosError(error)) {
      console.log(`🚨 Error type: Axios Error`);
      console.log(`📊 Status: ${error.response?.status || "No response"}`);
      console.log(`💬 Message: ${error.message}`);

      if (error.response?.data) {
        console.log(
          `📄 Error data: ${JSON.stringify(error.response.data, null, 2)}`
        );
      }

      if (error.code) {
        console.log(`🔢 Error code: ${error.code}`);
      }
    } else {
      console.log(
        `🚨 Error type: ${
          error instanceof Error ? error.constructor.name : "Unknown"
        }`
      );
      console.log(
        `💬 Message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  pollCount++;
}

// Function to start polling
function startPolling(): void {
  if (isPolling) {
    console.log("⚠️  Polling is already running!");
    return;
  }

  console.log("🚀 Starting polling mechanism...");
  console.log(`⚙️  Configuration:`);
  console.log(`   - URL: ${POLLING_CONFIG.url}`);
  console.log(`   - Interval: ${POLLING_CONFIG.interval}ms`);
  console.log(`   - Max attempts: ${POLLING_CONFIG.maxAttempts}`);
  console.log(`   - Timeout: ${POLLING_CONFIG.timeout}ms`);

  isPolling = true;
  pollCount = 0;

  // Make initial request immediately
  makeRequest();

  // Set up interval for subsequent requests
  pollInterval = setInterval(async () => {
    if (pollCount >= POLLING_CONFIG.maxAttempts) {
      console.log(
        `\n🏁 Maximum attempts (${POLLING_CONFIG.maxAttempts}) reached. Stopping polling.`
      );
      stopPolling();
      return;
    }

    await makeRequest();
  }, POLLING_CONFIG.interval);
}

// Function to stop polling
function stopPolling(): void {
  if (!isPolling) {
    console.log("⚠️  Polling is not running!");
    return;
  }

  console.log("🛑 Stopping polling mechanism...");
  isPolling = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  console.log(`📊 Final stats: ${pollCount} requests made`);
}

// Function to get polling status
function getPollingStatus(): void {
  console.log(`\n📊 Polling Status:`);
  console.log(`   - Is polling: ${isPolling ? "✅ Yes" : "❌ No"}`);
  console.log(`   - Requests made: ${pollCount}`);
  console.log(`   - Max attempts: ${POLLING_CONFIG.maxAttempts}`);
  console.log(
    `   - Remaining attempts: ${Math.max(
      0,
      POLLING_CONFIG.maxAttempts - pollCount
    )}`
  );
}

// Export functions for external use
export { startPolling, stopPolling, getPollingStatus, makeRequest };

// Function to run the polling demo
export function runPollingDemo(): void {
  console.log("🎯 Axios Polling Test Module");
  console.log("================================");

  // Start polling
  startPolling();

  // Set up graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Received SIGINT. Stopping polling...");
    stopPolling();
    process.exit(0);
  });

  // Show status every 30 seconds
  setInterval(() => {
    if (isPolling) {
      getPollingStatus();
    }
  }, 30000);
}
