"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-env node */
const dotenv_1 = require("dotenv");
const express_1 = __importDefault(require("express"));
// @ts-ignore 
const facilitator_1 = require("x402/facilitator");
const types_1 = require("x402/types");
(0, dotenv_1.config)();
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY || "";
const SVM_PRIVATE_KEY = process.env.SVM_PRIVATE_KEY || "";
if (!EVM_PRIVATE_KEY && !SVM_PRIVATE_KEY) {
    console.error("Missing required environment variables");
    process.exit(1);
}
const app = (0, express_1.default)();
// Configure express to parse JSON bodies
app.use(express_1.default.json());
app.get("/verify", (req, res) => {
    res.json({
        endpoint: "/verify",
        description: "POST to verify x402 payments",
        body: {
            paymentPayload: "PaymentPayload",
            paymentRequirements: "PaymentRequirements",
        },
    });
});
app.post("/verify", async (req, res) => {
    try {
        const body = req.body;
        const paymentRequirements = types_1.PaymentRequirementsSchema.parse(body.paymentRequirements);
        const paymentPayload = types_1.PaymentPayloadSchema.parse(body.paymentPayload);
        // use the correct client/signer based on the requested network
        // svm verify requires a Signer because it signs & simulates the txn
        let client;
        if (types_1.SupportedEVMNetworks.includes(paymentRequirements.network)) {
            client = (0, types_1.createConnectedClient)(paymentRequirements.network);
        }
        else if (types_1.SupportedSVMNetworks.includes(paymentRequirements.network)) {
            client = await (0, types_1.createSigner)(paymentRequirements.network, SVM_PRIVATE_KEY);
        }
        else {
            throw new Error("Invalid network");
        }
        // verify
        const valid = await (0, facilitator_1.verify)(client, paymentPayload, paymentRequirements);
        res.json(valid);
    }
    catch (error) {
        console.error("error", error);
        res.status(400).json({ error: "Invalid request" });
    }
});
app.get("/settle", (req, res) => {
    res.json({
        endpoint: "/settle",
        description: "POST to settle x402 payments",
        body: {
            paymentPayload: "PaymentPayload",
            paymentRequirements: "PaymentRequirements",
        },
    });
});
app.get("/supported", async (req, res) => {
    let kinds = [];
    // evm
    if (EVM_PRIVATE_KEY) {
        kinds.push({
            x402Version: 1,
            scheme: "exact",
            network: "polygon-amoy",
        });
    }
    // svm
    if (SVM_PRIVATE_KEY) {
        const signer = await (0, types_1.createSigner)("solana-devnet", SVM_PRIVATE_KEY);
        const feePayer = (0, types_1.isSvmSignerWallet)(signer) ? signer.address : undefined;
        kinds.push({
            x402Version: 1,
            scheme: "exact",
            network: "solana-devnet",
            extra: {
                feePayer,
            },
        });
    }
    res.json({
        kinds,
    });
});
app.post("/settle", async (req, res) => {
    try {
        const body = req.body;
        const paymentRequirements = types_1.PaymentRequirementsSchema.parse(body.paymentRequirements);
        const paymentPayload = types_1.PaymentPayloadSchema.parse(body.paymentPayload);
        // use the correct private key based on the requested network
        let signer;
        if (types_1.SupportedEVMNetworks.includes(paymentRequirements.network)) {
            signer = await (0, types_1.createSigner)(paymentRequirements.network, EVM_PRIVATE_KEY);
        }
        else if (types_1.SupportedSVMNetworks.includes(paymentRequirements.network)) {
            signer = await (0, types_1.createSigner)(paymentRequirements.network, SVM_PRIVATE_KEY);
        }
        else {
            throw new Error("Invalid network");
        }
        // settle
        const response = await (0, facilitator_1.settle)(signer, paymentPayload, paymentRequirements);
        res.json(response);
    }
    catch (error) {
        console.error("error", error);
        res.status(400).json({ error: `Invalid request: ${error}` });
    }
});
app.listen(process.env.PORT || 3000, () => {
    console.log(`Server listening at http://localhost:${process.env.PORT || 3000}`);
});
//# sourceMappingURL=index.js.map