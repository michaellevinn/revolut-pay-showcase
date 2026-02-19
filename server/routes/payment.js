const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

// Function to verify Revolut Webhook Signature
// https://developer.revolut.com/docs/guides/accept-payments/get-started/webhooks#validate-webhook-signatures
function verifySignature(req, secret) {
    const signature = req.headers['revolut-signature'];
    if (!signature) return false;

    const payload = JSON.stringify(req.body); 
    const timestamp = req.headers['revolut-request-timestamp'];
    
    const generatedSignature = 'v1=' + crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

    return signature === generatedSignature;
}

// 1. Set up an endpoint for creating orders
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency, line_items, merchantOrderData } = req.body;
    
    const payload = {
      amount,
      currency: currency,
      merchant_order_data: merchantOrderData,
      line_items: line_items
    };

    console.log('Creating order with payload:', payload);
    
    const response = await axios.post(process.env.MERCHANT_API_URL, payload, {
      headers: {
        'Authorization': `Bearer ${process.env.MERCHANT_API_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Revolut-Api-Version': '2025-12-04'
      }
    });
    console.log('Order created successfully:', response.data);

    // Send token back to the client side
    res.json({ token: response.data.token, publicKey: process.env.MERCHANT_API_PUBLIC_KEY });

  } catch (error) {
    console.error('Error creating order:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// 2. Webhook endpoint for payment updates
router.post('/webhook', async (req, res) => {
  try {
      const event = req.body;
      const signature = req.headers['revolut-signature'];
            
      console.log(`[Webhook] Received event: ${event.event} for Order: ${event.order_id}`);

      switch (event.event) {
          case 'ORDER_COMPLETED':
              console.log('Payment Successful! Order:', event.order_id);
              break;
          
          case 'ORDER_AUTHORISED':
              console.log('Payment Authorised. Capture funds if manual capture is enabled.');
              break;

          case 'ORDER_CANCELLED':
              console.log('Payment Cancelled.');
              break;
              
          default:
              console.log('Unhandled event type:', event.event);
      }

      // Always acknowledge receipt to stop Revolut from retrying
      res.status(200).send();
  } catch (err) {
      console.error('Webhook Error:', err);
      res.status(500).send();
  }
});

module.exports = router;
