// ==============================================
// DYNAMIC COMPONENT LOADER
// Proctor Auction Site
// ==============================================

document.addEventListener("DOMContentLoaded", function () {
  // Determine the base path based on current location
  const path = window.location.pathname;
  const isInSubdirectory = path.includes("/pages/") || path.includes("\\pages\\");
  const componentPath = isInSubdirectory ? "../components/" : "./components/";
  const basePath = isInSubdirectory ? "../" : "./";

  // Load header
  const headerPlaceholder = document.getElementById("header-placeholder");
  if (headerPlaceholder) {
    fetch(componentPath + "header.html")
      .then((response) => {
        if (!response.ok) throw new Error("Header not found");
        return response.text();
      })
      .then((data) => {
        headerPlaceholder.innerHTML = data;

        // Fix paths for subdirectory pages
        fixAssetPaths(headerPlaceholder, basePath);

        // Initialize mobile menu after header is loaded
        initMobileMenu();

        // Fix navigation links
        fixNavigationLinks(basePath);

        // Fix logo link when in subdirectory
        fixLogoLink(basePath);

        // Highlight active nav link
        highlightCurrentPage();
      })
      .catch((error) => console.error("Error loading header:", error));
  }

  // Load footer
  const footerPlaceholder = document.getElementById("footer-placeholder");
  if (footerPlaceholder) {
    fetch(componentPath + "footer.html")
      .then((response) => {
        if (!response.ok) throw new Error("Footer not found");
        return response.text();
      })
      .then((data) => {
        footerPlaceholder.innerHTML = data;

        // Fix paths for subdirectory pages
        fixAssetPaths(footerPlaceholder, basePath);

        // Set copyright year
        const copyrightYearElement = document.getElementById("copyright-year");
        if (copyrightYearElement) {
          copyrightYearElement.textContent = new Date().getFullYear();
        }

        // Initialize back to top button
        initBackToTopButton();
      })
      .catch((error) => console.error("Error loading footer:", error));
  }
});

// ==============================================
// MOBILE MENU FUNCTIONALITY
// ==============================================
function initMobileMenu() {
  const menuToggle = document.querySelector(".mobile-menu-toggle");
  const mainNav = document.querySelector(".main-nav");
  const menuIndicator = document.getElementById("menu-indicator");

  if (menuToggle && mainNav) {
    // Show menu indicator briefly to help users discover the menu
    setTimeout(() => {
      if (menuIndicator) {
        menuIndicator.classList.add("active");

        // Hide menu indicator after a delay
        setTimeout(() => {
          menuIndicator.classList.remove("active");
        }, 5000);
      }
    }, 2000);

    // Remove pulse animation after some time
    setTimeout(() => {
      menuToggle.style.animation = "none";
    }, 6000);

    // Toggle menu on hamburger click
    menuToggle.addEventListener("click", function (event) {
      event.stopPropagation();

      const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", !isExpanded);

      mainNav.classList.toggle("active");
      menuToggle.classList.toggle("active");

      // Hide the indicator permanently once user interacts with menu
      if (menuIndicator) {
        menuIndicator.classList.add("menu-indicator-hidden");
      }

      // Add animation to menu items when opening
      if (mainNav.classList.contains("active")) {
        const menuItems = mainNav.querySelectorAll("li");
        menuItems.forEach((item, index) => {
          item.style.opacity = "1";
          item.style.animationDelay = `${0.1 * index}s`;
          item.style.animation = "fadeInRight 0.5s forwards";
        });
      }
    });

    // Close menu when clicking outside
    document.addEventListener("click", function (event) {
      const isClickInsideMenu = mainNav.contains(event.target);
      const isClickOnMenuToggle = menuToggle.contains(event.target);

      if (
        !isClickInsideMenu &&
        !isClickOnMenuToggle &&
        mainNav.classList.contains("active")
      ) {
        mainNav.classList.remove("active");
        menuToggle.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close menu when ESC key is pressed
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && mainNav.classList.contains("active")) {
        mainNav.classList.remove("active");
        menuToggle.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
      }
    });
  }
}

// ==============================================
// PATH FIXING UTILITIES
// ==============================================

// Fix asset paths (images, etc.) when in subdirectory
function fixAssetPaths(container, basePath) {
  if (basePath === "./") return; // No need to fix if at root

  // Fix image sources
  const images = container.querySelectorAll("img[src^='./']");
  images.forEach((img) => {
    const src = img.getAttribute("src");
    img.setAttribute("src", src.replace("./", basePath));
  });

  // Fix links that start with ./
  const links = container.querySelectorAll("a[href^='./']");
  links.forEach((link) => {
    const href = link.getAttribute("href");
    link.setAttribute("href", href.replace("./", basePath));
  });
}

// Fix navigation links when in subdirectory
function fixNavigationLinks(basePath) {
  if (basePath === "./") return;

  const navLinks = document.querySelectorAll(".nav-menu a");
  navLinks.forEach((link) => {
    const href = link.getAttribute("href");

    // Fix links that point to pages directory
    if (href && href.startsWith("/pages/")) {
      // We're in a subdirectory, so pages/ links should stay relative to parent
      link.setAttribute("href", href); // Keep as-is since we're already in pages/
    } else if (href === "index.html") {
      link.setAttribute("href", basePath + "index.html");
    }
  });
}

// Fix the logo link when in subdirectory
function fixLogoLink(basePath) {
  const logoLink = document.getElementById("logo-link");
  if (logoLink) {
    const href = logoLink.getAttribute("href");
    if (href === "index.html" && basePath !== "./") {
      logoLink.setAttribute("href", basePath + "index.html");
    }
  }
}

// Highlight current page in navigation
function highlightCurrentPage() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll(".nav-menu a");

  navLinks.forEach((link) => {
    const linkPath = link.getAttribute("href");
    const pageName = currentPath.split("/").pop() || "index.html";

    // Check if current page matches the link's href
    if (linkPath) {
      const linkPageName = linkPath.split("/").pop();

      if (
        pageName === linkPageName ||
        (pageName === "" && linkPageName === "index.html") ||
        (currentPath.endsWith("/") && linkPageName === "index.html")
      ) {
        link.classList.add("active");
      }
    }
  });
}

// ==============================================
// BACK TO TOP BUTTON
// ==============================================
function initBackToTopButton() {
  const backToTopBtn = document.getElementById("back-to-top");

  if (backToTopBtn) {
    // Show button when user scrolls down 300px
    window.addEventListener("scroll", function () {
      if (window.pageYOffset > 300) {
        backToTopBtn.style.opacity = "1";
        backToTopBtn.style.visibility = "visible";
      } else {
        backToTopBtn.style.opacity = "0";
        backToTopBtn.style.visibility = "hidden";
      }
    });

    // Smooth scroll to top when clicked
    backToTopBtn.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }
}

// ==============================================
// UTILITY EXPORTS (for use in other scripts)
// ==============================================
window.AuctionSiteUtils = {
  initMobileMenu,
  initBackToTopButton,
  fixAssetPaths,
  fixNavigationLinks,
  fixLogoLink,
  highlightCurrentPage,
};
