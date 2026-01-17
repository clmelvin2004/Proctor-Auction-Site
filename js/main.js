// ==============================================
// MAIN JAVASCRIPT - Proctor Auction Site
// ==============================================

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  initSearchFunctionality();
  initLotCards();
  initCountdownTimers();
});

// ==============================================
// SEARCH FUNCTIONALITY
// ==============================================
function initSearchFunctionality() {
  // Hero search
  const heroSearch = document.querySelector(".hero__search");
  if (heroSearch) {
    const searchInput = heroSearch.querySelector("input");
    const searchBtn = heroSearch.querySelector("button");

    searchBtn?.addEventListener("click", function (e) {
      e.preventDefault();
      performSearch(searchInput?.value);
    });

    searchInput?.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        performSearch(searchInput.value);
      }
    });
  }

  // Header search
  const headerSearch = document.querySelector(".header-search");
  if (headerSearch) {
    const searchInput = headerSearch.querySelector("input");
    const searchBtn = headerSearch.querySelector("button");

    searchBtn?.addEventListener("click", function (e) {
      e.preventDefault();
      performSearch(searchInput?.value);
    });

    searchInput?.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        performSearch(searchInput.value);
      }
    });
  }
}

function performSearch(query) {
  if (!query || query.trim() === "") {
    return;
  }

  // Encode the search query and redirect to auctions page
  const encodedQuery = encodeURIComponent(query.trim());
  window.location.href = `pages/auctions.html?search=${encodedQuery}`;
}

// ==============================================
// LOT CARDS FUNCTIONALITY
// ==============================================
function initLotCards() {
  // Initialize favorite buttons
  const favoriteButtons = document.querySelectorAll(".lot-card__favorite");

  favoriteButtons.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      this.classList.toggle("active");

      // Get lot info for potential API call
      const lotCard = this.closest(".lot-card");
      const lotNumber = lotCard?.querySelector(".lot-card__lot-number")?.textContent;

      if (this.classList.contains("active")) {
        console.log(`Added ${lotNumber} to watchlist`);
        // TODO: API call to add to watchlist
      } else {
        console.log(`Removed ${lotNumber} from watchlist`);
        // TODO: API call to remove from watchlist
      }
    });
  });

  // Make entire lot card clickable (except for favorite button)
  const lotCards = document.querySelectorAll(".lot-card");

  lotCards.forEach((card) => {
    card.addEventListener("click", function (e) {
      // Don't navigate if clicking on favorite button
      if (e.target.closest(".lot-card__favorite")) {
        return;
      }

      const lotNumber = this.querySelector(".lot-card__lot-number")?.textContent;
      if (lotNumber) {
        // Extract lot ID and navigate to lot detail page
        const lotId = lotNumber.replace("Lot #", "").trim();
        window.location.href = `pages/lot.html?id=${lotId}`;
      }
    });
  });
}

// ==============================================
// COUNTDOWN TIMERS
// ==============================================
function initCountdownTimers() {
  // This would be connected to real auction end times from the backend
  // For now, we'll just set up the structure

  const timeElements = document.querySelectorAll(".lot-card__time-left span:last-child");

  // In production, these would have data attributes with actual end times
  // Example: <span data-end-time="2026-01-15T18:00:00Z">2d 14h left</span>

  timeElements.forEach((element) => {
    const endTime = element.dataset.endTime;
    if (endTime) {
      updateCountdown(element, new Date(endTime));
    }
  });
}

function updateCountdown(element, endTime) {
  const now = new Date();
  const diff = endTime - now;

  if (diff <= 0) {
    element.textContent = "Ended";
    element.parentElement.classList.add("lot-card__time-left--ended");
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let timeString = "";

  if (days > 0) {
    timeString = `${days}d ${hours}h left`;
  } else if (hours > 0) {
    timeString = `${hours}h ${minutes}m left`;
  } else {
    timeString = `${minutes}m left`;
    element.parentElement.classList.add("lot-card__time-left--urgent");
  }

  element.textContent = timeString;

  // Update every minute (or every second if less than an hour)
  const updateInterval = hours > 0 ? 60000 : 1000;
  setTimeout(() => updateCountdown(element, endTime), updateInterval);
}

// ==============================================
// FORMAT UTILITIES
// ==============================================
function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(num);
}

// ==============================================
// EXPORTS
// ==============================================
window.AuctionSite = {
  formatCurrency,
  formatNumber,
  performSearch,
  updateCountdown,
};
