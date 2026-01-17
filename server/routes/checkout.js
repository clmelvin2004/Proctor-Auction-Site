/**
 * Checkout Routes
 * Handles clerk checkout operations and payment processing
 */

const express = require('express');
const router = express.Router();
const {
    calculateTotals,
    createOrder,
    processCardPayment,
    recordCashPayment,
    getSquareAppId,
    getSquareLocationId
} = require('../services/squareService');

// In-memory storage for transactions (replace with DB in production)
const transactions = [];
const buyers = new Map();

/**
 * GET /api/checkout/config
 * Get Square configuration for frontend
 */
router.get('/config', (req, res) => {
    res.json({
        squareAppId: getSquareAppId(),
        squareLocationId: getSquareLocationId(),
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
        premiumRate: '10%',
        cardFeeRate: '3%'
    });
});

/**
 * POST /api/checkout/calculate
 * Calculate totals for a purchase
 */
router.post('/calculate', (req, res) => {
    const { items, isCardPayment } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items array is required' });
    }

    // Calculate totals for each item and sum
    const totalHammer = items.reduce((sum, item) => sum + (item.hammerPrice || 0), 0);
    const totals = calculateTotals(totalHammer, isCardPayment);

    res.json({
        items,
        totals,
        itemCount: items.length
    });
});

/**
 * POST /api/checkout/process
 * Process a complete checkout
 */
router.post('/process', async (req, res) => {
    const { items, buyer, paymentType, sourceId } = req.body;

    // Validate required fields
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Items are required' });
    }
    if (!buyer || !buyer.buyerNumber) {
        return res.status(400).json({ error: 'Buyer information is required' });
    }
    if (!paymentType || !['cash', 'card'].includes(paymentType)) {
        return res.status(400).json({ error: 'Payment type must be cash or card' });
    }

    const isCardPayment = paymentType === 'card';
    const totalHammer = items.reduce((sum, item) => sum + item.hammerPrice, 0);
    const totals = calculateTotals(totalHammer, isCardPayment);

    try {
        let result;

        if (isCardPayment) {
            if (!sourceId) {
                return res.status(400).json({ error: 'Card payment source is required' });
            }

            // Create Square order first
            const orderResult = await createOrder(items, { ...buyer, isCardPayment }, getSquareLocationId());
            
            if (!orderResult.success) {
                return res.status(500).json({ error: 'Failed to create order', details: orderResult.error });
            }

            // Process the card payment
            const paymentResult = await processCardPayment(
                sourceId,
                totals.total,
                orderResult.order.id,
                buyer
            );

            if (!paymentResult.success) {
                return res.status(400).json({ error: 'Payment failed', details: paymentResult.error });
            }

            result = {
                success: true,
                transactionId: paymentResult.payment.id,
                orderId: orderResult.order.id,
                paymentType: 'card',
                receipt: paymentResult.payment.receiptUrl
            };
        } else {
            // Cash payment - just record it
            result = recordCashPayment(items, buyer, totals);
        }

        // Store transaction
        const transaction = {
            id: result.transactionId,
            orderId: result.orderId,
            buyer,
            items,
            totals,
            paymentType,
            timestamp: new Date().toISOString(),
            receiptUrl: result.receipt
        };
        transactions.push(transaction);

        // Update buyer record
        if (!buyers.has(buyer.buyerNumber)) {
            buyers.set(buyer.buyerNumber, {
                ...buyer,
                transactions: [],
                totalSpent: 0
            });
        }
        const buyerRecord = buyers.get(buyer.buyerNumber);
        buyerRecord.transactions.push(transaction.id);
        buyerRecord.totalSpent += totals.total;

        res.json({
            success: true,
            transaction,
            message: `Payment of $${totals.total.toFixed(2)} processed successfully`
        });

    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: 'Checkout failed', details: error.message });
    }
});

/**
 * GET /api/checkout/transactions
 * Get all transactions (for clerk dashboard)
 */
router.get('/transactions', (req, res) => {
    const { date, buyerNumber } = req.query;
    
    let filtered = [...transactions];

    if (date) {
        filtered = filtered.filter(t => t.timestamp.startsWith(date));
    }
    if (buyerNumber) {
        filtered = filtered.filter(t => t.buyer.buyerNumber === parseInt(buyerNumber));
    }

    // Summary stats
    const totalRevenue = filtered.reduce((sum, t) => sum + t.totals.total, 0);
    const totalPremiums = filtered.reduce((sum, t) => sum + t.totals.buyersPremium + t.totals.cardFee, 0);
    const cashCount = filtered.filter(t => t.paymentType === 'cash').length;
    const cardCount = filtered.filter(t => t.paymentType === 'card').length;

    res.json({
        transactions: filtered,
        summary: {
            count: filtered.length,
            totalRevenue: roundToTwo(totalRevenue),
            totalPremiums: roundToTwo(totalPremiums),
            cashTransactions: cashCount,
            cardTransactions: cardCount
        }
    });
});

/**
 * GET /api/checkout/buyer/:buyerNumber
 * Get buyer information and their purchases
 */
router.get('/buyer/:buyerNumber', (req, res) => {
    const buyerNumber = parseInt(req.params.buyerNumber);
    const buyer = buyers.get(buyerNumber);

    if (!buyer) {
        return res.status(404).json({ error: 'Buyer not found' });
    }

    // Get their transactions
    const buyerTransactions = transactions.filter(
        t => t.buyer.buyerNumber === buyerNumber
    );

    res.json({
        buyer,
        transactions: buyerTransactions,
        itemsWon: buyerTransactions.reduce((sum, t) => sum + t.items.length, 0)
    });
});

/**
 * POST /api/checkout/buyer
 * Register a new buyer
 */
router.post('/buyer', (req, res) => {
    const { buyerNumber, name, phone, email } = req.body;

    if (!buyerNumber || !name) {
        return res.status(400).json({ error: 'Buyer number and name are required' });
    }

    if (buyers.has(buyerNumber)) {
        return res.status(400).json({ error: 'Buyer number already exists' });
    }

    const newBuyer = {
        buyerNumber,
        name,
        phone: phone || '',
        email: email || '',
        transactions: [],
        totalSpent: 0,
        registeredAt: new Date().toISOString()
    };

    buyers.set(buyerNumber, newBuyer);

    res.json({
        success: true,
        buyer: newBuyer
    });
});

/**
 * GET /api/checkout/receipt/:transactionId
 * Generate receipt data
 */
router.get('/receipt/:transactionId', (req, res) => {
    const transaction = transactions.find(t => t.id === req.params.transactionId);

    if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
    }

    const receipt = {
        businessName: 'Almost Heaven Auctions LLC',
        businessLocation: '[insert location here]',
        transactionId: transaction.id,
        date: new Date(transaction.timestamp).toLocaleString(),
        buyer: {
            number: transaction.buyer.buyerNumber,
            name: transaction.buyer.name
        },
        items: transaction.items.map(item => ({
            lot: item.lotNumber,
            description: item.description,
            hammerPrice: item.hammerPrice
        })),
        totals: transaction.totals,
        paymentMethod: transaction.paymentType.toUpperCase(),
        thankYouMessage: 'Thank you for bidding with Almost Heaven Auctions!'
    };

    res.json(receipt);
});

function roundToTwo(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

module.exports = router;
