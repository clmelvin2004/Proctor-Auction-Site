// ==============================================
// DATABASE SERVICE - SQLite
// ==============================================

const Database = require('better-sqlite3');
const path = require('path');

// Database file location
const dbPath = path.join(__dirname, '../../data/auctions.db');

// Initialize database
let db;

function initDatabase() {
    db = new Database(dbPath);
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // Create tables
    createTables();
    
    console.log('📦 Database initialized at:', dbPath);
    
    return db;
}

function createTables() {
    // Auction Schedule table
    db.exec(`
        CREATE TABLE IF NOT EXISTS auction_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            auction_date DATE NOT NULL,
            start_time TIME NOT NULL,
            preview_time TIME,
            location TEXT DEFAULT '[insert location here]',
            status TEXT DEFAULT 'upcoming',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Bidders table (for online registration)
    db.exec(`
        CREATE TABLE IF NOT EXISTS bidders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bidder_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Transactions table (for checkout records)
    db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT UNIQUE NOT NULL,
            bidder_number TEXT NOT NULL,
            subtotal INTEGER NOT NULL,
            buyers_premium INTEGER NOT NULL,
            card_fee INTEGER DEFAULT 0,
            total INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            square_payment_id TEXT,
            status TEXT DEFAULT 'completed',
            items_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Lots table (for auction items)
    db.exec(`
        CREATE TABLE IF NOT EXISTS lots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auction_id INTEGER,
            lot_number INTEGER NOT NULL,
            description TEXT NOT NULL,
            starting_bid INTEGER DEFAULT 0,
            winning_bid INTEGER,
            winner_bidder_number TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (auction_id) REFERENCES auction_schedule(id)
        )
    `);

    console.log('📋 Database tables created/verified');
}

// ==============================================
// SCHEDULE CRUD OPERATIONS
// ==============================================

function getAllScheduledAuctions() {
    const stmt = db.prepare(`
        SELECT * FROM auction_schedule 
        WHERE auction_date >= date('now', '-1 day')
        ORDER BY auction_date ASC, start_time ASC
    `);
    return stmt.all();
}

function getUpcomingAuctions(limit = 10) {
    const stmt = db.prepare(`
        SELECT * FROM auction_schedule 
        WHERE auction_date >= date('now')
        AND status = 'upcoming'
        ORDER BY auction_date ASC, start_time ASC
        LIMIT ?
    `);
    return stmt.all(limit);
}

function getNextAuction() {
    const stmt = db.prepare(`
        SELECT * FROM auction_schedule 
        WHERE auction_date >= date('now')
        AND status = 'upcoming'
        ORDER BY auction_date ASC, start_time ASC
        LIMIT 1
    `);
    return stmt.get();
}

function getAuctionById(id) {
    const stmt = db.prepare('SELECT * FROM auction_schedule WHERE id = ?');
    return stmt.get(id);
}

function createAuction(auction) {
    const stmt = db.prepare(`
        INSERT INTO auction_schedule (title, description, auction_date, start_time, preview_time, location, status)
        VALUES (@title, @description, @auction_date, @start_time, @preview_time, @location, @status)
    `);
    
    const result = stmt.run({
        title: auction.title,
        description: auction.description || '',
        auction_date: auction.auction_date,
        start_time: auction.start_time,
        preview_time: auction.preview_time || null,
        location: auction.location || '[insert location here]',
        status: auction.status || 'upcoming'
    });
    
    return { id: result.lastInsertRowid, ...auction };
}

function updateAuction(id, updates) {
    const fields = [];
    const values = { id };
    
    for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && key !== 'id') {
            fields.push(`${key} = @${key}`);
            values[key] = value;
        }
    }
    
    if (fields.length === 0) return null;
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    
    const stmt = db.prepare(`
        UPDATE auction_schedule 
        SET ${fields.join(', ')}
        WHERE id = @id
    `);
    
    stmt.run(values);
    return getAuctionById(id);
}

function deleteAuction(id) {
    const stmt = db.prepare('DELETE FROM auction_schedule WHERE id = ?');
    return stmt.run(id);
}

// ==============================================
// BIDDER OPERATIONS
// ==============================================

function getBidderByNumber(bidderNumber) {
    const stmt = db.prepare('SELECT * FROM bidders WHERE bidder_number = ?');
    return stmt.get(bidderNumber);
}

function createBidder(bidder) {
    const stmt = db.prepare(`
        INSERT INTO bidders (bidder_number, name, email, phone, address)
        VALUES (@bidder_number, @name, @email, @phone, @address)
    `);
    
    try {
        const result = stmt.run({
            bidder_number: bidder.bidder_number,
            name: bidder.name,
            email: bidder.email || null,
            phone: bidder.phone || null,
            address: bidder.address || null
        });
        return { id: result.lastInsertRowid, ...bidder };
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return getBidderByNumber(bidder.bidder_number);
        }
        throw error;
    }
}

// ==============================================
// TRANSACTION OPERATIONS
// ==============================================

function saveTransaction(transaction) {
    const stmt = db.prepare(`
        INSERT INTO transactions (transaction_id, bidder_number, subtotal, buyers_premium, card_fee, total, payment_method, square_payment_id, status, items_json)
        VALUES (@transaction_id, @bidder_number, @subtotal, @buyers_premium, @card_fee, @total, @payment_method, @square_payment_id, @status, @items_json)
    `);
    
    const result = stmt.run({
        transaction_id: transaction.transaction_id,
        bidder_number: transaction.bidder_number,
        subtotal: transaction.subtotal,
        buyers_premium: transaction.buyers_premium,
        card_fee: transaction.card_fee || 0,
        total: transaction.total,
        payment_method: transaction.payment_method,
        square_payment_id: transaction.square_payment_id || null,
        status: transaction.status || 'completed',
        items_json: JSON.stringify(transaction.items || [])
    });
    
    return { id: result.lastInsertRowid, ...transaction };
}

function getTransactionById(transactionId) {
    const stmt = db.prepare('SELECT * FROM transactions WHERE transaction_id = ?');
    const result = stmt.get(transactionId);
    if (result && result.items_json) {
        result.items = JSON.parse(result.items_json);
    }
    return result;
}

function getTransactionsByBidder(bidderNumber) {
    const stmt = db.prepare('SELECT * FROM transactions WHERE bidder_number = ? ORDER BY created_at DESC');
    const results = stmt.all(bidderNumber);
    return results.map(r => {
        if (r.items_json) r.items = JSON.parse(r.items_json);
        return r;
    });
}

// ==============================================
// SEED DATA (for development)
// ==============================================

function seedSampleData() {
    // Check if we already have data
    const existing = db.prepare('SELECT COUNT(*) as count FROM auction_schedule').get();
    if (existing.count > 0) {
        console.log('Sample data already exists, skipping seed');
        return;
    }

    console.log('Seeding sample auction data...');

    const sampleAuctions = [
        {
            title: 'Placeholder 1',
            description: 'Placeholder description 1',
            auction_date: '2026-01-17',
            start_time: '10:00',
            preview_time: '09:00',
            location: '[insert location here]',
            status: 'upcoming'
        },
        {
            title: 'Placeholder 2',
            description: 'Placeholder description 2',
            auction_date: '2026-01-24',
            start_time: '10:00',
            preview_time: '09:00',
            location: '[insert location here]',
            status: 'upcoming'
        },
        {
            title: 'Placeholder 3',
            description: 'Placeholder description 3',
            auction_date: '2026-01-31',
            start_time: '11:00',
            preview_time: '10:00',
            location: '[insert location here]',
            status: 'upcoming'
        },
        {
            title: 'Placeholder 4',
            description: 'Placeholder description 4',
            auction_date: '2026-02-07',
            start_time: '10:00',
            preview_time: '09:00',
            location: '[insert location here]',
            status: 'upcoming'
        }
    ];

    for (const auction of sampleAuctions) {
        createAuction(auction);
    }

    console.log('Sample data seeded successfully');
}

// ==============================================
// EXPORTS
// ==============================================

module.exports = {
    initDatabase,
    getDb: () => db,
    
    // Schedule
    getAllScheduledAuctions,
    getUpcomingAuctions,
    getNextAuction,
    getAuctionById,
    createAuction,
    updateAuction,
    deleteAuction,
    
    // Bidders
    getBidderByNumber,
    createBidder,
    
    // Transactions
    saveTransaction,
    getTransactionById,
    getTransactionsByBidder,
    
    // Dev
    seedSampleData
};
