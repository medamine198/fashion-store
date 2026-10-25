let products = [];

const productsContainer = document.getElementById("products");
const searchInput = document.getElementById("search");
const categoryButtons = [...document.querySelectorAll(".category-chip")];
const resultCount = document.getElementById("result-count");
const emptyState = document.getElementById("empty-state");
const cartDrawer = document.getElementById("cart-drawer");
const cartItemsContainer = document.getElementById("cart-items");
const cartEmpty = document.getElementById("cart-empty");
const cartSummary = document.getElementById("cart-summary");
const backdrop = document.getElementById("drawer-backdrop");
const toast = document.getElementById("toast");

let activeCategory = "tout";
let cart = loadStoredValue("nova-cart", {});
let favorites = new Set(loadStoredValue("nova-favorites", []));
let toastTimeout;

function loadStoredValue(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function saveStoredValue(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        showToast("Le stockage local est indisponible sur cet appareil.");
    }
}

function formatPrice(price) {
    return `${price} DT`;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function renderProducts() {
    const query = searchInput.value.trim().toLocaleLowerCase("fr");
    const sort = document.getElementById("sort").value;
    const visibleProducts = products.filter(product => {
        const matchesCategory = activeCategory === "tout" || product.category === activeCategory;
        const matchesQuery = `${product.name} ${product.categoryLabel}`.toLocaleLowerCase("fr").includes(query);
        return matchesCategory && matchesQuery;
    });

    if (sort === "price-asc") visibleProducts.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") visibleProducts.sort((a, b) => b.price - a.price);
    if (sort === "name") visibleProducts.sort((a, b) => a.name.localeCompare(b.name, "fr"));

    productsContainer.innerHTML = visibleProducts.map((product, index) => `
        <article class="product" style="animation-delay:${Math.min(index * 45, 270)}ms">
            <div class="product-image-wrap">
                <img class="product-image" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy">
                <span class="product-badge">${escapeHTML(product.badge)}</span>
                <button class="favorite-button${favorites.has(product.id) ? " is-favorite" : ""}" type="button" data-favorite="${product.id}" aria-label="${favorites.has(product.id) ? "Retirer des" : "Ajouter aux"} favoris" aria-pressed="${favorites.has(product.id)}">${favorites.has(product.id) ? "♥" : "♡"}</button>
                <button class="add-button" type="button" data-add="${product.id}">Ajouter au panier <span aria-hidden="true">+</span></button>
            </div>
            <div class="product-info">
                <div><p class="product-category">${product.categoryLabel}</p><h3 class="product-title">${escapeHTML(product.name)}</h3></div>
                <p class="product-price">${formatPrice(product.price)}</p>
            </div>
        </article>
    `).join("");

    resultCount.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? "article" : "articles"}`;
    emptyState.hidden = visibleProducts.length > 0;
    emptyState.textContent = window.NovaCatalog.getLastError()
        ? "La boutique est temporairement indisponible. Réessayez dans un instant."
        : "Aucun article ne correspond à votre recherche.";
}

function renderCart() {
    const entries = Object.entries(cart).filter(([id, quantity]) => products.some(product => product.id === id) && quantity > 0);
    cart = Object.fromEntries(entries);
    const quantity = entries.reduce((total, [, count]) => total + count, 0);
    const subtotal = entries.reduce((total, [id, count]) => total + products.find(product => product.id === id).price * count, 0);

    document.getElementById("count").textContent = quantity;
    document.getElementById("cart-item-label").textContent = `(${quantity})`;
    document.getElementById("cart-subtotal").textContent = formatPrice(subtotal);
    cartEmpty.hidden = quantity > 0;
    cartSummary.hidden = quantity === 0;
    cartItemsContainer.innerHTML = entries.map(([id, count]) => {
        const product = products.find(item => item.id === id);
        return `<article class="cart-item">
            <img src="${product.image}" alt="" loading="lazy">
            <div><h3>${product.name}</h3><p class="cart-item-price">${formatPrice(product.price)}</p>
                <div class="quantity-control" aria-label="Quantité de ${product.name}">
                    <button type="button" data-quantity="${id}" data-change="-1" aria-label="Retirer une unité">−</button>
                    <span>${count}</span>
                    <button type="button" data-quantity="${id}" data-change="1" aria-label="Ajouter une unité">+</button>
                </div>
            </div>
            <button class="remove-item" type="button" data-remove="${id}" aria-label="Supprimer ${product.name}">×</button>
        </article>`;
    }).join("");
    saveStoredValue("nova-cart", cart);
}

function showToast(message) {
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setCartOpen(isOpen) {
    cartDrawer.classList.toggle("is-open", isOpen);
    cartDrawer.setAttribute("aria-hidden", String(!isOpen));
    cartDrawer.inert = !isOpen;
    backdrop.hidden = !isOpen;
    if (isOpen) document.getElementById("close-cart").focus();
    else document.getElementById("open-cart").focus();
}

function setCategory(category) {
    activeCategory = category;
    categoryButtons.forEach(button => button.classList.toggle("is-active", button.dataset.category === category));
    renderProducts();
}

productsContainer.addEventListener("click", event => {
    const addButton = event.target.closest("[data-add]");
    const favoriteButton = event.target.closest("[data-favorite]");
    if (addButton) {
        const id = addButton.dataset.add;
        cart[id] = (cart[id] || 0) + 1;
        renderCart();
        showToast(`${products.find(product => product.id === id).name} ajouté au panier.`);
    }
    if (favoriteButton) {
        const id = favoriteButton.dataset.favorite;
        if (favorites.has(id)) favorites.delete(id);
        else favorites.add(id);
        saveStoredValue("nova-favorites", [...favorites]);
        renderProducts();
    }
});

cartItemsContainer.addEventListener("click", event => {
    const quantityButton = event.target.closest("[data-quantity]");
    const removeButton = event.target.closest("[data-remove]");
    if (quantityButton) {
        const id = quantityButton.dataset.quantity;
        cart[id] = (cart[id] || 0) + Number(quantityButton.dataset.change);
        if (cart[id] <= 0) delete cart[id];
        renderCart();
    }
    if (removeButton) {
        delete cart[removeButton.dataset.remove];
        renderCart();
    }
});

categoryButtons.forEach(button => button.addEventListener("click", () => setCategory(button.dataset.category)));
document.querySelectorAll("[data-nav-category]").forEach(link => link.addEventListener("click", () => setCategory(link.dataset.navCategory)));
searchInput.addEventListener("input", renderProducts);
document.getElementById("sort").addEventListener("change", renderProducts);
document.getElementById("open-cart").addEventListener("click", () => setCartOpen(true));
document.getElementById("close-cart").addEventListener("click", () => setCartOpen(false));
document.getElementById("continue-shopping").addEventListener("click", () => setCartOpen(false));
backdrop.addEventListener("click", () => setCartOpen(false));
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && cartDrawer.classList.contains("is-open")) setCartOpen(false);
});
document.getElementById("checkout-button").addEventListener("click", () => showToast("La commande en ligne sera bientôt disponible. Contactez-nous pour commander."));
window.addEventListener("nova:products-updated", event => {
    products = event.detail;
    renderProducts();
    renderCart();
});
window.addEventListener("nova:api-error", renderProducts);

window.NovaCatalog.ready.then(() => {
    products = window.NovaCatalog.getProducts();
    renderProducts();
    renderCart();
});