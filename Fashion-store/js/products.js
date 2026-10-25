(() => {
    const categories = {
        femme: "Femme",
        homme: "Homme",
        accessoires: "Accessoires"
    };
    const API_ROOT = "/api";
    let products = [];
    let version = -1;
    let lastError = null;
    let requestInFlight = false;

    async function request(path, options = {}) {
        const headers = new Headers(options.headers || {});
        if (options.body) headers.set("Content-Type", "application/json");
        const token = sessionStorage.getItem("nova-admin-token");
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, cache: "no-store" });
        const payload = response.status === 204 ? null : await response.json().catch(() => null);
        if (!response.ok) {
            if (response.status === 401 && path.startsWith("/admin/") && path !== "/admin/login") {
                window.dispatchEvent(new Event("nova:admin-auth-required"));
            }
            throw new Error(payload?.error || `Erreur serveur (${response.status}).`);
        }
        return payload;
    }

    async function refreshProducts(force = false) {
        if (requestInFlight || (document.hidden && !force)) return products;
        requestInFlight = true;
        try {
            const payload = await request("/products");
            lastError = null;
            if (payload.version !== version) {
                products = payload.products.map(product => ({
                    ...product,
                    categoryLabel: categories[product.category],
                    price: Number(product.price)
                }));
                version = payload.version;
                window.dispatchEvent(new CustomEvent("nova:products-updated", { detail: products }));
            }
        } catch (error) {
            lastError = error;
            window.dispatchEvent(new CustomEvent("nova:api-error", { detail: error }));
        } finally {
            requestInFlight = false;
        }
        return products;
    }

    async function addProduct(product) {
        await request("/admin/products", { method: "POST", body: JSON.stringify(product) });
        await refreshProducts(true);
    }

    async function updateProduct(id, product) {
        await request(`/admin/products/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(product) });
        await refreshProducts(true);
    }

    async function deleteProduct(id) {
        await request(`/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
        await refreshProducts(true);
    }

    async function resetProducts() {
        await request("/admin/reset", { method: "POST", body: "{}" });
        await refreshProducts(true);
    }

    async function login(password) {
        const result = await request("/admin/login", { method: "POST", body: JSON.stringify({ password }) });
        sessionStorage.setItem("nova-admin-token", result.token);
        return result;
    }

    async function checkAdminSession() {
        if (!sessionStorage.getItem("nova-admin-token")) return false;
        try {
            await request("/admin/session");
            return true;
        } catch {
            sessionStorage.removeItem("nova-admin-token");
            return false;
        }
    }

    async function logout() {
        try {
            await request("/admin/logout", { method: "POST", body: "{}" });
        } catch {
            sessionStorage.removeItem("nova-admin-token");
        }
        sessionStorage.removeItem("nova-admin-token");
        window.dispatchEvent(new Event("nova:admin-auth-required"));
    }

    const ready = refreshProducts(true);
    const pollTimer = window.setInterval(refreshProducts, 3000);
    window.addEventListener("pagehide", () => window.clearInterval(pollTimer), { once: true });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshProducts(true);
    });

    window.NovaCatalog = {
        categories,
        ready,
        getProducts: () => products.map(product => ({ ...product })),
        getLastError: () => lastError,
        refreshProducts,
        addProduct,
        updateProduct,
        deleteProduct,
        resetProducts,
        login,
        checkAdminSession,
        logout
    };
})();
