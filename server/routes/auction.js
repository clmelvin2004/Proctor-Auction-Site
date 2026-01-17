/**
 * Auction Routes
 * REST API endpoints for auction management
 */

const express = require('express');
const router = express.Router();
const { auctionState } = require('../services/socketService');

// In-memory storage for lots (replace with DB in production)
const lots = [];
let currentAuction = null;

/**
 * GET /api/auction/status
 * Get current auction status
 */
router.get('/status', (req, res) => {
    res.json({
        isLive: auctionState.isLive,
        currentLot: auctionState.currentLot,
        currentBid: auctionState.currentBid,
        onlineBidders: auctionState.connectedClients.bidders,
        pendingBids: auctionState.onlineBids.filter(b => b.status === 'pending').length
    });
});

/**
 * GET /api/auction/lots
 * Get all lots for current auction
 */
router.get('/lots', (req, res) => {
    res.json({
        auction: currentAuction,
        lots: lots,
        totalLots: lots.length
    });
});

/**
 * POST /api/auction/lots
 * Add a new lot
 */
router.post('/lots', (req, res) => {
    const { number, description, startingBid, estimate, category, images } = req.body;

    if (!number || !description) {
        return res.status(400).json({ error: 'Lot number and description are required' });
    }

    const lot = {
        id: `lot_${Date.now()}`,
        number,
        description,
        startingBid: startingBid || 0,
        estimate: estimate || null,
        category: category || 'General',
        images: images || [],
        status: 'pending', // pending, active, sold, passed
        winningBid: null,
        winner: null,
        createdAt: new Date().toISOString()
    };

    lots.push(lot);

    res.json({
        success: true,
        lot
    });
});

/**
 * POST /api/auction/lots/bulk
 * Add multiple lots at once
 */
router.post('/lots/bulk', (req, res) => {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Items array is required' });
    }

    const addedLots = items.map((item, index) => ({
        id: `lot_${Date.now()}_${index}`,
        number: item.number || (lots.length + index + 1),
        description: item.description || 'No description',
        startingBid: item.startingBid || 0,
        estimate: item.estimate || null,
        category: item.category || 'General',
        images: item.images || [],
        status: 'pending',
        winningBid: null,
        winner: null,
        createdAt: new Date().toISOString()
    }));

    lots.push(...addedLots);

    res.json({
        success: true,
        added: addedLots.length,
        lots: addedLots
    });
});

/**
 * PUT /api/auction/lots/:lotId
 * Update a lot
 */
router.put('/lots/:lotId', (req, res) => {
    const lotIndex = lots.findIndex(l => l.id === req.params.lotId);

    if (lotIndex === -1) {
        return res.status(404).json({ error: 'Lot not found' });
    }

    const updates = req.body;
    lots[lotIndex] = { ...lots[lotIndex], ...updates };

    res.json({
        success: true,
        lot: lots[lotIndex]
    });
});

/**
 * DELETE /api/auction/lots/:lotId
 * Delete a lot
 */
router.delete('/lots/:lotId', (req, res) => {
    const lotIndex = lots.findIndex(l => l.id === req.params.lotId);

    if (lotIndex === -1) {
        return res.status(404).json({ error: 'Lot not found' });
    }

    const deleted = lots.splice(lotIndex, 1)[0];

    res.json({
        success: true,
        deleted
    });
});

/**
 * POST /api/auction/create
 * Create a new auction
 */
router.post('/create', (req, res) => {
    const { title, date, startTime, description, livestreamUrl } = req.body;

    if (!title || !date) {
        return res.status(400).json({ error: 'Title and date are required' });
    }

    currentAuction = {
        id: `auction_${Date.now()}`,
        title,
        date,
        startTime: startTime || '10:00 AM',
        description: description || '',
        livestreamUrl: livestreamUrl || '',
        status: 'scheduled', // scheduled, live, completed
        createdAt: new Date().toISOString()
    };

    // Clear previous lots
    lots.length = 0;

    res.json({
        success: true,
        auction: currentAuction
    });
});

/**
 * GET /api/auction/current
 * Get current auction details
 */
router.get('/current', (req, res) => {
    if (!currentAuction) {
        return res.status(404).json({ error: 'No active auction' });
    }

    res.json({
        auction: currentAuction,
        lotCount: lots.length,
        soldCount: lots.filter(l => l.status === 'sold').length
    });
});

/**
 * GET /api/auction/online-bids
 * Get pending online bids (for clerk view)
 */
router.get('/online-bids', (req, res) => {
    res.json({
        pendingBids: auctionState.onlineBids.filter(b => b.status === 'pending'),
        allBids: auctionState.onlineBids
    });
});

/**
 * POST /api/auction/record-sale
 * Record a completed sale
 */
router.post('/record-sale', (req, res) => {
    const { lotNumber, winningBid, buyerNumber, buyerName, isOnline } = req.body;

    if (!lotNumber || !winningBid || !buyerNumber) {
        return res.status(400).json({ 
            error: 'Lot number, winning bid, and buyer number are required' 
        });
    }

    // Find and update the lot
    const lot = lots.find(l => l.number == lotNumber);
    if (lot) {
        lot.status = 'sold';
        lot.winningBid = winningBid;
        lot.winner = {
            buyerNumber,
            name: buyerName || `Buyer #${buyerNumber}`,
            isOnline: isOnline || false
        };
        lot.soldAt = new Date().toISOString();
    }

    // Broadcast via socket if available
    const io = req.app.get('io');
    if (io) {
        io.emit('auction:lotSold', {
            lotNumber,
            winningBid,
            winner: buyerName || `Buyer #${buyerNumber}`,
            isOnline
        });
    }

    res.json({
        success: true,
        sale: {
            lotNumber,
            winningBid,
            buyerNumber,
            buyerName,
            isOnline,
            timestamp: new Date().toISOString()
        }
    });
});

module.exports = router;
