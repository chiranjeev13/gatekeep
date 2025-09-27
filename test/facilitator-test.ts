import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withPaymentInterceptor } from "x402-axios";
import axios from "axios";
import { polygonAmoy } from "viem/chains";

// Create a wallet client
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const client = createWalletClient({
  account,
  transport: http(),
  chain: polygonAmoy,
});

// Create an Axios instance with payment handling
const api = withPaymentInterceptor(
  axios.create({
    baseURL: "http://localhost:8000",
  }),
  client as any
);

// Make a request that may require payment
const response = await api.get("/api/premium");
console.log(response.data);
