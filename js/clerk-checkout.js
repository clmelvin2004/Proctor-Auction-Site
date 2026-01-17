/**
 * Clerk Checkout System - JavaScript
 * Handles:
 * - Item entry and cart management
 * - Total calculations with premiums
 * - Square payment processing
 * - WebSocket connection for live bid monitoring
 */

// ===========================================
// CONFIGURATION
// ===========================================
const API_BASE = '/api';
let squarePayments = null;
let squareCard = null;
let socket = null;

// Premium rates
const BUYERS_PREMIUM_RATE = 0.10;
const CARD_FEE_RATE = 0.03;

// Cart state
const cart = {
    buyerNumber: null,
    buyerName: '',
    items: [],
    paymentMethod: 'cash'
};

// ===========================================
// INITIALIZATION
// ===========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Socket.io connection
    initializeSocket();
    
    // Initialize Square
    await initializeSquare();
    
    // Setup event listeners
    setupEventListeners();
    
    // Focus on lot number field
    document.getElementById('lot-number').focus();
});

// ===========================================
// SOCKET.IO CONNECTION
// ===========================================
function initializeSocket() {
    socket = io();

    socket.on('connect', () => {
        updateConnectionStatus(true);
        // Register as clerk
        socket.emit('register:clerk', {
            clerkId: `clerk_${Date.now()}`,
            name: 'Clerk Terminal'
        });
    });

    socket.on('disconnect', () => {
        updateConnectionStatus(false);
    });

    // Bidder count updates
    socket.on('bidders:count', (count) => {
        document.getElementById('bidder-count').textContent = count;
    });

    // New online bid received
    socket.on('bid:new', (bid) => {
        addOnlineBid(bid);
        showToast(`New online bid: $${bid.amount} from ${bid.bidderName}`, 'info');
        playBidSound();
    });

    // Full auction state (on connect)
    socket.on('auction:fullState', (state) => {
        document.getElementById('bidder-count').textContent = state.connectedClients.bidders;
        if (state.currentLot) {
            updateCurrentLotDisplay(state.currentLot, state.currentBid);
        }
        // Render any pending bids
        state.onlineBids
            .filter(b => b.status === 'pending')
            .forEach(bid => addOnlineBid(bid));
    });
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (connected) {
        statusEl.className = 'status-indicator status-indicator--connected';
        statusEl.innerHTML = '<span class="status-dot"></span> Connected';
    } else {
        statusEl.className = 'status-indicator status-indicator--disconnected';
        statusEl.innerHTML = '<span class="status-dot"></span> Disconnected';
    }
}

// ===========================================
// SQUARE PAYMENTS
// ===========================================
async function initializeSquare() {
    try {
        const config = await fetch(`${API_BASE}/checkout/config`).then(r => r.json());
        
        if (!config.squareAppId) {
            console.warn('Square not configured');
            return;
        }

        squarePayments = Square.payments(config.squareAppId, config.squareLocationId);
    } catch (error) {
        console.error('Failed to initialize Square:', error);
    }
}

async function initializeCardForm() {
    if (!squarePayments) {
        showToast('Square payments not configured', 'error');
        return;
    }

    try {
        // Destroy existing card if present
        if (squareCard) {
            await squareCard.destroy();
        }

        squareCard = await squarePayments.card();
        await squareCard.attach('#card-container');
    } catch (error) {
        console.error('Failed to initialize card form:', error);
        showToast('Failed to load card form', 'error');
    }
}

// ===========================================
// EVENT LISTENERS
// ===========================================
function setupEventListeners() {
    // Item form submission
    document.getElementById('item-form').addEventListener('submit', handleAddItem);

    // Clear form button
    document.getElementById('btn-clear-form').addEventListener('click', clearForm);

    // Clear cart button
    document.getElementById('btn-clear-cart').addEventListener('click', clearCart);

    // Payment method selection
    document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
        radio.addEventListener('change', handlePaymentMethodChange);
    });

    // Checkout button
    document.getElementById('btn-checkout').addEventListener('click', handleCheckout);

    // Set lot button
    document.getElementById('btn-set-lot').addEventListener('click', () => {
        document.getElementById('lot-modal').style.display = 'flex';
    });

    // Set lot form
    document.getElementById('set-lot-form').addEventListener('submit', handleSetLot);

    // Mark sold button
    document.getElementById('btn-sold').addEventListener('click', handleMarkSold);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// ===========================================
// ITEM & CART MANAGEMENT
// ===========================================
function handleAddItem(e) {
    e.preventDefault();

    const form = e.target;
    const item = {
        lotNumber: parseInt(form.lotNumber.value),
        hammerPrice: parseFloat(form.hammerPrice.value),
        description: form.description.value || `Lot ${form.lotNumber.value}`,
        isOnline: form.isOnline.checked
    };

    const buyerNumber = parseInt(form.buyerNumber.value);
    const buyerName = form.buyerName.value;

    // Check if adding to existing cart or new buyer
    if (cart.buyerNumber && cart.buyerNumber !== buyerNumber) {
        if (!confirm(`Cart has items for Buyer #${cart.buyerNumber}. Start new cart for Buyer #${buyerNumber}?`)) {
            return;
        }
        clearCart();
    }

    // Set buyer info
    cart.buyerNumber = buyerNumber;
    cart.buyerName = buyerName;
    cart.items.push(item);

    // Update UI
    renderCart();
    updateTotals();
    clearForm();

    // Record the sale via API (optional - for lot tracking)
    recordSale(item, buyerNumber, buyerName, item.isOnline);

    showToast(`Lot ${item.lotNumber} added - $${item.hammerPrice.toFixed(2)}`, 'success');
}

function renderCart() {
    const cartEl = document.getElementById('cart-items');
    const buyerEl = document.getElementById('cart-buyer-number');

    if (cart.items.length === 0) {
        cartEl.innerHTML = '<p class="cart-empty">No items in cart</p>';
        buyerEl.textContent = '';
        document.getElementById('btn-checkout').disabled = true;
        return;
    }

    buyerEl.textContent = `Buyer #${cart.buyerNumber}${cart.buyerName ? ` - ${cart.buyerName}` : ''}`;

    cartEl.innerHTML = cart.items.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item__info">
                <span class="cart-item__lot">Lot ${item.lotNumber}</span>
                <span class="cart-item__desc">${item.description}</span>
                ${item.isOnline ? '<span class="cart-item__badge badge--online">Online</span>' : ''}
            </div>
            <div class="cart-item__price">$${item.hammerPrice.toFixed(2)}</div>
            <button type="button" class="cart-item__remove" onclick="removeItem(${index})" title="Remove">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        </div>
    `).join('');

    document.getElementById('btn-checkout').disabled = false;
}

function removeItem(index) {
    cart.items.splice(index, 1);
    if (cart.items.length === 0) {
        cart.buyerNumber = null;
        cart.buyerName = '';
    }
    renderCart();
    updateTotals();
}

function clearCart() {
    cart.buyerNumber = null;
    cart.buyerName = '';
    cart.items = [];
    renderCart();
    updateTotals();
}

function clearForm() {
    const form = document.getElementById('item-form');
    form.lotNumber.value = '';
    form.hammerPrice.value = '';
    form.description.value = '';
    form.isOnline.checked = false;
    // Keep buyer number if cart has items
    if (!cart.buyerNumber) {
        form.buyerNumber.value = '';
        form.buyerName.value = '';
    }
    form.lotNumber.focus();
}

// ===========================================
// TOTALS CALCULATION
// ===========================================
function updateTotals() {
    const isCard = cart.paymentMethod === 'card';
    const hammerTotal = cart.items.reduce((sum, item) => sum + item.hammerPrice, 0);
    const premium = hammerTotal * BUYERS_PREMIUM_RATE;
    const subtotal = hammerTotal + premium;
    const cardFee = isCard ? subtotal * CARD_FEE_RATE : 0;
    const total = subtotal + cardFee;

    document.getElementById('subtotal-hammer').textContent = `$${hammerTotal.toFixed(2)}`;
    document.getElementById('buyers-premium').textContent = `$${premium.toFixed(2)}`;
    document.getElementById('card-fee').textContent = `$${cardFee.toFixed(2)}`;
    document.getElementById('grand-total').textContent = `$${total.toFixed(2)}`;

    // Show/hide card fee row
    document.getElementById('card-fee-row').style.display = isCard ? 'flex' : 'none';
}

function handlePaymentMethodChange(e) {
    cart.paymentMethod = e.target.value;
    updateTotals();

    const cardFormContainer = document.getElementById('card-form-container');
    if (e.target.value === 'card') {
        cardFormContainer.style.display = 'block';
        initializeCardForm();
    } else {
        cardFormContainer.style.display = 'none';
    }
}

// ===========================================
// CHECKOUT PROCESSING
// ===========================================
async function handleCheckout() {
    if (cart.items.length === 0) {
        showToast('Cart is empty', 'error');
        return;
    }

    const checkoutBtn = document.getElementById('btn-checkout');
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing...';

    try {
        let sourceId = null;

        // Get card token if card payment
        if (cart.paymentMethod === 'card') {
            if (!squareCard) {
                throw new Error('Card form not initialized');
            }
            const tokenResult = await squareCard.tokenize();
            if (tokenResult.status !== 'OK') {
                throw new Error(tokenResult.errors?.[0]?.message || 'Card tokenization failed');
            }
            sourceId = tokenResult.token;
        }

        // Process checkout via API
        const response = await fetch(`${API_BASE}/checkout/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cart.items,
                buyer: {
                    buyerNumber: cart.buyerNumber,
                    name: cart.buyerName
                },
                paymentType: cart.paymentMethod,
                sourceId
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Checkout failed');
        }

        // Success!
        showToast(`Sale complete! Transaction: ${result.transaction.id}`, 'success');
        
        // Show receipt
        showReceipt(result.transaction);

        // Clear cart
        clearCart();
        clearForm();

    } catch (error) {
        console.error('Checkout error:', error);
        showToast(error.message || 'Checkout failed', 'error');
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Complete Sale';
    }
}

// ===========================================
// ONLINE BIDS MANAGEMENT
// ===========================================
function addOnlineBid(bid) {
    const bidsContainer = document.getElementById('online-bids');
    
    // Remove empty message if present
    const emptyMsg = bidsContainer.querySelector('.bids-empty');
    if (emptyMsg) emptyMsg.remove();

    // Check if bid already exists
    if (document.getElementById(`bid-${bid.id}`)) return;

    const bidEl = document.createElement('div');
    bidEl.id = `bid-${bid.id}`;
    bidEl.className = 'online-bid online-bid--new';
    bidEl.innerHTML = `
        <div class="online-bid__info">
            <span class="online-bid__amount">$${bid.amount}</span>
            <span class="online-bid__bidder">${bid.bidderName}</span>
            <span class="online-bid__lot">Lot ${bid.lotNumber}</span>
        </div>
        <div class="online-bid__actions">
            <button class="btn btn--sm btn--success" onclick="acceptBid('${bid.id}')">Accept</button>
            <button class="btn btn--sm btn--outline" onclick="rejectBid('${bid.id}')">Reject</button>
        </div>
    `;

    bidsContainer.prepend(bidEl);

    // Remove 'new' animation after a moment
    setTimeout(() => bidEl.classList.remove('online-bid--new'), 1000);
}

function acceptBid(bidId) {
    socket.emit('bid:accept', { bidId });
    removeBidFromUI(bidId);
    showToast('Bid accepted!', 'success');
}

function rejectBid(bidId) {
    socket.emit('bid:reject', { bidId, reason: 'Rejected by auctioneer' });
    removeBidFromUI(bidId);
}

function removeBidFromUI(bidId) {
    const bidEl = document.getElementById(`bid-${bidId}`);
    if (bidEl) {
        bidEl.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => bidEl.remove(), 300);
    }

    // Show empty message if no bids left
    const bidsContainer = document.getElementById('online-bids');
    if (bidsContainer.children.length === 0) {
        bidsContainer.innerHTML = '<p class="bids-empty">No pending bids</p>';
    }
}

// ===========================================
// LOT MANAGEMENT
// ===========================================
function handleSetLot(e) {
    e.preventDefault();

    const lot = {
        number: parseInt(document.getElementById('modal-lot-number').value),
        description: document.getElementById('modal-lot-description').value,
    };
    const startingBid = parseFloat(document.getElementById('modal-starting-bid').value) || 0;

    socket.emit('auction:setLot', { lot, startingBid });
    updateCurrentLotDisplay(lot, startingBid);
    closeLotModal();

    showToast(`Lot ${lot.number} is now active`, 'info');
}

function updateCurrentLotDisplay(lot, currentBid) {
    const display = document.getElementById('current-lot-display');
    display.innerHTML = `
        <div class="current-lot__number">Lot ${lot.number}</div>
        <div class="current-lot__desc">${lot.description}</div>
        <div class="current-lot__bid">Current Bid: $${currentBid}</div>
    `;
    document.getElementById('btn-sold').disabled = false;
}

function handleMarkSold() {
    // This would be triggered when auctioneer says "SOLD"
    // For now, just clear the current lot
    socket.emit('auction:sold', {
        amount: 0, // Would come from current bid
        winner: 'Floor Bidder',
        isOnline: false
    });

    document.getElementById('current-lot-display').innerHTML = '<p class="no-lot">No lot active</p>';
    document.getElementById('btn-sold').disabled = true;
}

function closeLotModal() {
    document.getElementById('lot-modal').style.display = 'none';
    document.getElementById('set-lot-form').reset();
}

// ===========================================
// RECORD SALE (for lot tracking)
// ===========================================
async function recordSale(item, buyerNumber, buyerName, isOnline) {
    try {
        await fetch(`${API_BASE}/auction/record-sale`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lotNumber: item.lotNumber,
                winningBid: item.hammerPrice,
                buyerNumber,
                buyerName,
                isOnline
            })
        });
    } catch (error) {
        console.warn('Failed to record sale:', error);
    }
}

// ===========================================
// RECEIPT
// ===========================================
function showReceipt(transaction) {
    const modal = document.getElementById('receipt-modal');
    const content = document.getElementById('receipt-content');

    content.innerHTML = `
        <div class="receipt">
            <div class="receipt__header">
                <h3>Almost Heaven Auctions LLC</h3>
                <p>[insert location here]</p>
            </div>
            <div class="receipt__divider"></div>
            <div class="receipt__info">
                <p><strong>Transaction:</strong> ${transaction.id}</p>
                <p><strong>Date:</strong> ${new Date(transaction.timestamp).toLocaleString()}</p>
                <p><strong>Buyer:</strong> #${transaction.buyer.buyerNumber} ${transaction.buyer.name || ''}</p>
                <p><strong>Payment:</strong> ${transaction.paymentType.toUpperCase()}</p>
            </div>
            <div class="receipt__divider"></div>
            <div class="receipt__items">
                ${transaction.items.map(item => `
                    <div class="receipt__item">
                        <span>Lot ${item.lotNumber}: ${item.description}</span>
                        <span>$${item.hammerPrice.toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
            <div class="receipt__divider"></div>
            <div class="receipt__totals">
                <div class="receipt__row">
                    <span>Subtotal:</span>
                    <span>$${transaction.totals.hammerPrice.toFixed(2)}</span>
                </div>
                <div class="receipt__row">
                    <span>Buyer's Premium (10%):</span>
                    <span>$${transaction.totals.buyersPremium.toFixed(2)}</span>
                </div>
                ${transaction.totals.cardFee > 0 ? `
                    <div class="receipt__row">
                        <span>Card Fee (3%):</span>
                        <span>$${transaction.totals.cardFee.toFixed(2)}</span>
                    </div>
                ` : ''}
                <div class="receipt__row receipt__row--total">
                    <span>TOTAL:</span>
                    <span>$${transaction.totals.total.toFixed(2)}</span>
                </div>
            </div>
            <div class="receipt__divider"></div>
            <div class="receipt__footer">
                <p>Thank you for bidding with Almost Heaven Auctions!</p>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeReceiptModal() {
    document.getElementById('receipt-modal').style.display = 'none';
}

function printReceipt() {
    window.print();
}

// ===========================================
// TOAST NOTIFICATIONS
// ===========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
        <span class="toast__message">${message}</span>
        <button class="toast__close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => toast.remove(), 5000);
}

// ===========================================
// KEYBOARD SHORTCUTS
// ===========================================
function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + Enter = Checkout
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!document.getElementById('btn-checkout').disabled) {
            handleCheckout();
        }
    }

    // Escape = Close modals
    if (e.key === 'Escape') {
        closeReceiptModal();
        closeLotModal();
    }

    // F2 = Focus lot number
    if (e.key === 'F2') {
        e.preventDefault();
        document.getElementById('lot-number').focus();
    }
}

// ===========================================
// SOUND EFFECTS
// ===========================================
function playBidSound() {
    // Simple beep for new bids
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    setTimeout(() => oscillator.stop(), 150);
}
