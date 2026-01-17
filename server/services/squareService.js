/**
 * Square Payment Service
 * Handles payment processing via Square
 * 
 * Premium Structure:
 * - 10% buyer's premium on all sales
 * - Additional 3% for card transactions
 */

const { Client, Environment } = require('square');
const { v4: uuidv4 } = require('uuid');

// Initialize Square client
const squareClient = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.NODE_ENV === 'production' 
        ? Environment.Production 
        : Environment.Sandbox
});

const { paymentsApi, ordersApi, customersApi } = squareClient;

// Premium rates
const BUYERS_PREMIUM_RATE = 0.10; // 10%
const CARD_FEE_RATE = 0.03;       // 3%

/**
 * Calculate totals including premiums
 * @param {number} hammerPrice - Winning bid amount
 * @param {boolean} isCardPayment - Whether paying by card
 * @returns {Object} Breakdown of all charges
 */
function calculateTotals(hammerPrice, isCardPayment = false) {
    const buyersPremium = hammerPrice * BUYERS_PREMIUM_RATE;
    const subtotal = hammerPrice + buyersPremium;
    const cardFee = isCardPayment ? subtotal * CARD_FEE_RATE : 0;
    const total = subtotal + cardFee;

    return {
        hammerPrice: roundToTwo(hammerPrice),
        buyersPremium: roundToTwo(buyersPremium),
        buyersPremiumRate: `${BUYERS_PREMIUM_RATE * 100}%`,
        subtotal: roundToTwo(subtotal),
        cardFee: roundToTwo(cardFee),
        cardFeeRate: isCardPayment ? `${CARD_FEE_RATE * 100}%` : '0%',
        total: roundToTwo(total),
        isCardPayment
    };
}

/**
 * Create a Square order for the transaction
 */
async function createOrder(items, buyerInfo, locationId) {
    const lineItems = items.map(item => ({
        name: `Lot ${item.lotNumber}: ${item.description}`,
        quantity: '1',
        basePriceMoney: {
            amount: BigInt(Math.round(item.hammerPrice * 100)), // Convert to cents
            currency: 'USD'
        },
        note: `Hammer: $${item.hammerPrice}`
    }));

    // Calculate total premium
    const totalHammer = items.reduce((sum, item) => sum + item.hammerPrice, 0);
    const totals = calculateTotals(totalHammer, buyerInfo.isCardPayment);

    // Add buyer's premium as line item
    lineItems.push({
        name: "Buyer's Premium (10%)",
        quantity: '1',
        basePriceMoney: {
            amount: BigInt(Math.round(totals.buyersPremium * 100)),
            currency: 'USD'
        }
    });

    // Add card fee if applicable
    if (buyerInfo.isCardPayment && totals.cardFee > 0) {
        lineItems.push({
            name: "Card Processing Fee (3%)",
            quantity: '1',
            basePriceMoney: {
                amount: BigInt(Math.round(totals.cardFee * 100)),
                currency: 'USD'
            }
        });
    }

    try {
        const response = await ordersApi.createOrder({
            order: {
                locationId: locationId || process.env.SQUARE_LOCATION_ID,
                lineItems,
                referenceId: `AHA-${Date.now()}`, // Almost Heaven Auctions reference
                metadata: {
                    buyerNumber: buyerInfo.buyerNumber?.toString(),
                    buyerName: buyerInfo.name,
                    auctionDate: new Date().toISOString().split('T')[0]
                }
            },
            idempotencyKey: uuidv4()
        });

        return {
            success: true,
            order: response.result.order,
            totals
        };
    } catch (error) {
        console.error('Square Order Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Process card payment via Square
 */
async function processCardPayment(sourceId, amount, orderId, buyerInfo) {
    try {
        const response = await paymentsApi.createPayment({
            sourceId, // From Square Web Payments SDK
            idempotencyKey: uuidv4(),
            amountMoney: {
                amount: BigInt(Math.round(amount * 100)), // Convert to cents
                currency: 'USD'
            },
            orderId,
            referenceId: `AHA-${buyerInfo.buyerNumber}-${Date.now()}`,
            note: `Almost Heaven Auctions - Buyer #${buyerInfo.buyerNumber}`,
            buyerEmailAddress: buyerInfo.email || undefined
        });

        return {
            success: true,
            payment: response.result.payment
        };
    } catch (error) {
        console.error('Square Payment Error:', error);
        return {
            success: false,
            error: error.errors?.[0]?.detail || error.message
        };
    }
}

/**
 * Record a cash payment (no actual Square transaction, just for records)
 */
function recordCashPayment(items, buyerInfo, totals) {
    return {
        success: true,
        paymentType: 'cash',
        transactionId: `CASH-${Date.now()}`,
        buyerNumber: buyerInfo.buyerNumber,
        buyerName: buyerInfo.name,
        items,
        totals,
        timestamp: new Date().toISOString()
    };
}

/**
 * Get Square Web Payments SDK application ID
 */
function getSquareAppId() {
    return process.env.SQUARE_APP_ID;
}

/**
 * Get Square location ID
 */
function getSquareLocationId() {
    return process.env.SQUARE_LOCATION_ID;
}

// Helper to round to 2 decimal places
function roundToTwo(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

module.exports = {
    calculateTotals,
    createOrder,
    processCardPayment,
    recordCashPayment,
    getSquareAppId,
    getSquareLocationId,
    BUYERS_PREMIUM_RATE,
    CARD_FEE_RATE
};
