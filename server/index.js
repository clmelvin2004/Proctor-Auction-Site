/**
 * Almost Heaven Auctions - Server
 * Main entry point for the auction system
 * Handles: Express API, WebSocket live bidding, Square payments
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Database
const db = require('./services/databaseService');

// Routes
const checkoutRoutes = require('./routes/checkout');
const auctionRoutes = require('./routes/auction');
const scheduleRoutes = require('./routes/schedule');

// Services
const { initializeSocket } = require('./services/socketService');

const app = express();
const server = http.createServer(app);

// Initialize database
db.initDatabase();
db.seedSampleData(); // Seed sample data for development

// Socket.io setup with CORS
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // Serve static files from root

// Make io available to routes
app.set('io', io);

// API Routes
app.use('/api/checkout', checkoutRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/schedule', scheduleRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'Almost Heaven Auctions',
        timestamp: new Date().toISOString()
    });
});

// Initialize WebSocket handlers
initializeSocket(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║          Almost Heaven Auctions - Server Started          ║
╠═══════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}                        ║
║  WebSocket:  ws://localhost:${PORT}                          ║
║  Square:     ${process.env.SQUARE_ACCESS_TOKEN ? 'Configured' : 'Not configured'}                                   ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = { app, server, io };
