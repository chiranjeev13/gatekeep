const express = require('express');
const app = express();

app.get('/verify', (req, res) => {
    res.status(402).json({
        "error": "Payment Required",
        "paymentRequirements": {
            "scheme": "exact",
            "network": "polygon-amoy",
            "payTo": "0x376b7271dD22D14D82Ef594324ea14e7670ed5b2",
            "maxAmountRequired": "100",
            "maxTimeoutSeconds": 3600,
            "asset": "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
            "resource": "https://whatwasthatmeme.org/api/premium",
            "description": "Premium content access",
            "mimeType": "application/json"
        }
    });
});

app.listen(3000, () => console.log('402 Payment service running'));
