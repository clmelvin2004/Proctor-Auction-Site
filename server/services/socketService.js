/**
 * WebSocket Service - Live Auction Bidding
 * Handles real-time communication between:
 * - Online bidders submitting bids
 * - Clerk/Auctioneer monitoring incoming bids
 * - Broadcasting auction state updates
 */

// In-memory auction state (could be replaced with Redis for production)
const auctionState = {
    isLive: false,
    currentLot: null,
    currentBid: 0,
    bidIncrement: 5,
    onlineBids: [],
    connectedClients: {
        bidders: 0,
        clerks: 0
    }
};

// Connected sockets by role
const connectedSockets = {
    bidders: new Map(),
    clerks: new Map()
};

function initializeSocket(io) {
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);

        // ===========================================
        // CLIENT REGISTRATION
        // ===========================================
        
        // Register as online bidder
        socket.on('register:bidder', (data) => {
            const { bidderId, name } = data;
            connectedSockets.bidders.set(socket.id, {
                bidderId,
                name,
                socket
            });
            socket.join('bidders');
            auctionState.connectedClients.bidders = connectedSockets.bidders.size;
            
            // Send current auction state to new bidder
            socket.emit('auction:state', getPublicAuctionState());
            
            // Notify clerks of bidder count update
            io.to('clerks').emit('bidders:count', auctionState.connectedClients.bidders);
            
            console.log(`Bidder registered: ${name} (${bidderId})`);
        });

        // Register as clerk/auctioneer
        socket.on('register:clerk', (data) => {
            const { clerkId, name } = data;
            connectedSockets.clerks.set(socket.id, {
                clerkId,
                name,
                socket
            });
            socket.join('clerks');
            auctionState.connectedClients.clerks = connectedSockets.clerks.size;
            
            // Send full auction state to clerk
            socket.emit('auction:fullState', auctionState);
            
            console.log(`Clerk registered: ${name} (${clerkId})`);
        });

        // ===========================================
        // BIDDING (Online Bidders)
        // ===========================================
        
        // Online bidder submits a bid
        socket.on('bid:submit', (data) => {
            const bidder = connectedSockets.bidders.get(socket.id);
            if (!bidder) {
                socket.emit('bid:error', { message: 'Not registered as bidder' });
                return;
            }

            if (!auctionState.isLive) {
                socket.emit('bid:error', { message: 'Auction is not currently live' });
                return;
            }

            const { amount } = data;
            
            // Validate bid amount
            if (amount <= auctionState.currentBid) {
                socket.emit('bid:error', { 
                    message: `Bid must be higher than current bid of $${auctionState.currentBid}` 
                });
                return;
            }

            // Create bid record
            const bid = {
                id: `bid_${Date.now()}`,
                bidderId: bidder.bidderId,
                bidderName: bidder.name,
                amount: amount,
                lotNumber: auctionState.currentLot?.number,
                timestamp: new Date().toISOString(),
                status: 'pending', // pending, accepted, rejected
                isOnline: true
            };

            // Add to bid queue
            auctionState.onlineBids.push(bid);

            // Confirm to bidder
            socket.emit('bid:confirmed', { 
                message: 'Bid submitted - waiting for auctioneer',
                bid 
            });

            // Alert clerks of new online bid
            io.to('clerks').emit('bid:new', bid);

            console.log(`Online bid: $${amount} from ${bidder.name} on Lot ${auctionState.currentLot?.number}`);
        });

        // ===========================================
        // AUCTION CONTROL (Clerk/Auctioneer)
        // ===========================================
        
        // Start live auction
        socket.on('auction:start', (data) => {
            if (!connectedSockets.clerks.has(socket.id)) {
                socket.emit('error', { message: 'Unauthorized' });
                return;
            }

            auctionState.isLive = true;
            auctionState.currentLot = data.lot || null;
            auctionState.currentBid = data.startingBid || 0;
            auctionState.bidIncrement = data.bidIncrement || 5;
            auctionState.onlineBids = [];

            // Broadcast to all
            io.emit('auction:started', {
                lot: auctionState.currentLot,
                startingBid: auctionState.currentBid,
                bidIncrement: auctionState.bidIncrement
            });

            console.log(`Auction started - Lot ${auctionState.currentLot?.number}`);
        });

        // Set current lot
        socket.on('auction:setLot', (data) => {
            if (!connectedSockets.clerks.has(socket.id)) return;

            auctionState.currentLot = data.lot;
            auctionState.currentBid = data.startingBid || 0;
            auctionState.onlineBids = [];

            io.emit('auction:lotChanged', {
                lot: auctionState.currentLot,
                currentBid: auctionState.currentBid
            });

            console.log(`Lot changed to: ${data.lot.number} - ${data.lot.description}`);
        });

        // Update current bid (from floor bidding)
        socket.on('auction:updateBid', (data) => {
            if (!connectedSockets.clerks.has(socket.id)) return;

            auctionState.currentBid = data.amount;

            io.emit('auction:bidUpdate', {
                currentBid: auctionState.currentBid,
                source: data.source || 'floor' // 'floor' or 'online'
            });
        });

        // Accept online bid
        socket.on('bid:accept', (data) => {
            if (!connectedSockets.clerks.has(socket.id)) return;

            const { bidId } = data;
            const bidIndex = auctionState.onlineBids.findIndex(b => b.id === bidId);
            
            if (bidIndex !== -1) {
                const bid = auctionState.onlineBids[bidIndex];
                bid.status = 'accepted';
                auctionState.currentBid = bid.amount;

                // Notify the winning bidder
                const bidderSocket = Array.from(connectedSockets.bidders.values())
                    .find(b => b.bidderId === bid.bidderId);
                if (bidderSocket) {
                    bidderSocket.socket.emit('bid:accepted', { bid });
                }

                // Broadcast bid update to all
                io.emit('auction:bidUpdate', {
                    currentBid: auctionState.currentBid,
                    source: 'online',
                    bidderName: bid.bidderName
                });

                console.log(`Bid accepted: $${bid.amount} from ${bid.bidderName}`);
            }
        });

        // Reject online bid
        socket.on('bid:reject', (data) => {
            if (!connectedSockets.clerks.has(socket.id)) return;

            const { bidId, reason } = data;
            const bidIndex = auctionState.onlineBids.findIndex(b => b.id === bidId);
            
            if (bidIndex !== -1) {
                const bid = auctionState.onlineBids[bidIndex];
                bid.status = 'rejected';

                // Notify the bidder
                const bidderSocket = Array.from(connectedSockets.bidders.values())
                    .find(b => b.bidderId === bid.bidderId);
                if (bidderSocket) {
                    bidderSocket.socket.emit('bid:rejected', { bid, reason });
                }

                console.log(`Bid rejected: $${bid.amount} from ${bid.bidderName}`);
            }
        });

        // Lot sold
        socket.on('auction:sold', (data) => {
            if (!connectedSockets.clerks.has(socket.id)) return;

            const soldInfo = {
                lot: auctionState.currentLot,
                winningBid: data.amount,
                winner: data.winner,
                isOnline: data.isOnline || false,
                timestamp: new Date().toISOString()
            };

            io.emit('auction:lotSold', soldInfo);
            
            // Clear current lot
            auctionState.currentLot = null;
            auctionState.currentBid = 0;
            auctionState.onlineBids = [];

            console.log(`SOLD! Lot ${soldInfo.lot?.number} for $${soldInfo.winningBid} to ${soldInfo.winner}`);
        });

        // End auction
        socket.on('auction:end', () => {
            if (!connectedSockets.clerks.has(socket.id)) return;

            auctionState.isLive = false;
            auctionState.currentLot = null;
            auctionState.currentBid = 0;
            auctionState.onlineBids = [];

            io.emit('auction:ended', {
                message: 'Auction has ended. Thank you for bidding!'
            });

            console.log(`Auction ended`);
        });

        // ===========================================
        // DISCONNECT
        // ===========================================
        
        socket.on('disconnect', () => {
            // Remove from bidders
            if (connectedSockets.bidders.has(socket.id)) {
                const bidder = connectedSockets.bidders.get(socket.id);
                connectedSockets.bidders.delete(socket.id);
                auctionState.connectedClients.bidders = connectedSockets.bidders.size;
                io.to('clerks').emit('bidders:count', auctionState.connectedClients.bidders);
                console.log(`Bidder disconnected: ${bidder.name}`);
            }

            // Remove from clerks
            if (connectedSockets.clerks.has(socket.id)) {
                const clerk = connectedSockets.clerks.get(socket.id);
                connectedSockets.clerks.delete(socket.id);
                auctionState.connectedClients.clerks = connectedSockets.clerks.size;
                console.log(`Clerk disconnected: ${clerk.name}`);
            }

            console.log(`Client disconnected: ${socket.id}`);
        });
    });
}

// Get sanitized state for public (bidders)
function getPublicAuctionState() {
    return {
        isLive: auctionState.isLive,
        currentLot: auctionState.currentLot,
        currentBid: auctionState.currentBid,
        bidIncrement: auctionState.bidIncrement,
        onlineBidders: auctionState.connectedClients.bidders
    };
}

module.exports = { 
    initializeSocket,
    auctionState
};
