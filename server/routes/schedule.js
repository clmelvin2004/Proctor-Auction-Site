// ==============================================
// SCHEDULE ROUTES - Auction Calendar API
// ==============================================

const express = require('express');
const router = express.Router();
const db = require('../services/databaseService');

// ---------------------------------------------
// GET /api/schedule - Get all upcoming auctions
// ---------------------------------------------
router.get('/', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const auctions = db.getUpcomingAuctions(limit);
        
        res.json({
            success: true,
            data: auctions
        });
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch auction schedule'
        });
    }
});

// ---------------------------------------------
// GET /api/schedule/next - Get next auction
// ---------------------------------------------
router.get('/next', (req, res) => {
    try {
        const auction = db.getNextAuction();
        
        res.json({
            success: true,
            data: auction || null
        });
    } catch (error) {
        console.error('Error fetching next auction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch next auction'
        });
    }
});

// ---------------------------------------------
// GET /api/schedule/:id - Get auction by ID
// ---------------------------------------------
router.get('/:id', (req, res) => {
    try {
        const auction = db.getAuctionById(req.params.id);
        
        if (!auction) {
            return res.status(404).json({
                success: false,
                error: 'Auction not found'
            });
        }
        
        res.json({
            success: true,
            data: auction
        });
    } catch (error) {
        console.error('Error fetching auction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch auction'
        });
    }
});

// ---------------------------------------------
// POST /api/schedule - Create new auction (admin)
// ---------------------------------------------
router.post('/', (req, res) => {
    try {
        const { title, description, auction_date, start_time, preview_time, location } = req.body;
        
        // Validation
        if (!title || !auction_date || !start_time) {
            return res.status(400).json({
                success: false,
                error: 'Title, auction_date, and start_time are required'
            });
        }
        
        const auction = db.createAuction({
            title,
            description,
            auction_date,
            start_time,
            preview_time,
            location,
            status: 'upcoming'
        });
        
        res.status(201).json({
            success: true,
            data: auction,
            message: 'Auction created successfully'
        });
    } catch (error) {
        console.error('Error creating auction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create auction'
        });
    }
});

// ---------------------------------------------
// PUT /api/schedule/:id - Update auction (admin)
// ---------------------------------------------
router.put('/:id', (req, res) => {
    try {
        const existing = db.getAuctionById(req.params.id);
        
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Auction not found'
            });
        }
        
        const updated = db.updateAuction(req.params.id, req.body);
        
        res.json({
            success: true,
            data: updated,
            message: 'Auction updated successfully'
        });
    } catch (error) {
        console.error('Error updating auction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update auction'
        });
    }
});

// ---------------------------------------------
// DELETE /api/schedule/:id - Delete auction (admin)
// ---------------------------------------------
router.delete('/:id', (req, res) => {
    try {
        const existing = db.getAuctionById(req.params.id);
        
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Auction not found'
            });
        }
        
        db.deleteAuction(req.params.id);
        
        res.json({
            success: true,
            message: 'Auction deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting auction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete auction'
        });
    }
});

module.exports = router;
