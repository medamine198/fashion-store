const catalog = window.NovaCatalog;
const form = document.getElementById("product-form");
const tableBody = document.getElementById("admin-products");
const searchInput = document.getElementById("admin-search");
const emptyState = document.getElementById("catalog-empty");
const toast = document.getElementById("admin-toast");
let products = [];
let toastTimeout;

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
	const visibleProducts = products.filter(product =>
		`${product.name} ${product.categoryLabel} ${product.badge}`.toLocaleLowerCase("fr").includes(query)
	);

	tableBody.innerHTML = visibleProducts.map(product => `
		<tr>
			<td><div class="table-product"><img src="${escapeHTML(product.image)}" alt="" loading="lazy"><div><strong>${escapeHTML(product.name)}</strong><span>Réf. ${escapeHTML(product.id)}</span></div></div></td>
			<td>${product.categoryLabel}</td>
			<td class="table-price">${product.price} DT</td>
			<td><span class="table-badge">${escapeHTML(product.badge || "—")}</span></td>
			<td><div class="row-actions"><button class="row-action" type="button" data-edit="${escapeHTML(product.id)}">Modifier</button><button class="row-action delete" type="button" data-delete="${escapeHTML(product.id)}">Supprimer</button></div></td>
		</tr>
	`).join("");

	emptyState.hidden = visibleProducts.length > 0;
	document.getElementById("catalog-count").textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? "article" : "articles"}`;
	document.getElementById("metric-products").textContent = products.length;
	document.getElementById("metric-categories").textContent = new Set(products.map(product => product.category)).size;
	const average = products.length ? products.reduce((total, product) => total + product.price, 0) / products.length : 0;
	document.getElementById("metric-average").textContent = `${average.toLocaleString("fr-TN", { maximumFractionDigits: 1 })} DT`;
}

function showToast(message) {
	clearTimeout(toastTimeout);
	toast.textContent = message;
	toast.classList.add("is-visible");
	toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function resetForm() {
	form.reset();
	document.getElementById("product-id").value = "";
	document.getElementById("editor-kicker").textContent = "NOUVEL ARTICLE";
	document.getElementById("editor-title").textContent = "Ajouter un produit";
	document.getElementById("save-product").innerHTML = 'Ajouter au catalogue <span aria-hidden="true">↗</span>';
	document.getElementById("cancel-edit").hidden = true;
	document.getElementById("image-preview-wrap").hidden = true;
	form.elements.name.focus();
}

function startEditing(product) {
	document.getElementById("product-id").value = product.id;
	document.getElementById("product-name").value = product.name;
	document.getElementById("product-category").value = product.category;
	document.getElementById("product-price").value = product.price;
	document.getElementById("product-badge").value = product.badge;
	document.getElementById("product-image").value = product.image;
	document.getElementById("editor-kicker").textContent = "MODIFIER L’ARTICLE";
	document.getElementById("editor-title").textContent = "Modifier le produit";
	document.getElementById("save-product").innerHTML = 'Enregistrer les changements <span aria-hidden="true">↗</span>';
	document.getElementById("cancel-edit").hidden = false;
	updateImagePreview();
	document.getElementById("product-name").focus();
}

function updateImagePreview() {
	const imageUrl = document.getElementById("product-image").value.trim();
	const previewWrap = document.getElementById("image-preview-wrap");
	const preview = document.getElementById("image-preview");
	previewWrap.hidden = !imageUrl;
	if (imageUrl) preview.src = imageUrl;
}

async function persistProducts(operation, successMessage) {
	try {
		await operation;
		products = catalog.getProducts();
		renderProducts();
		showToast(successMessage);
		return true;
	} catch (error) {
		showToast(error.message);
		return false;
	}
}

form.addEventListener("submit", async event => {
	event.preventDefault();
	if (!form.reportValidity()) return;

	const id = document.getElementById("product-id").value;
	const category = document.getElementById("product-category").value;
	const product = {
		name: document.getElementById("product-name").value.trim(),
		category,
		categoryLabel: catalog.categories[category],
		price: Number(document.getElementById("product-price").value),
		badge: document.getElementById("product-badge").value.trim() || "Nouveau",
		image: document.getElementById("product-image").value.trim()
	};
	const isNewProduct = !id;
	const operation = isNewProduct ? catalog.addProduct(product) : catalog.updateProduct(id, product);
	if (await persistProducts(operation, isNewProduct ? "Produit ajouté au catalogue." : "Modifications enregistrées.")) resetForm();
});

tableBody.addEventListener("click", async event => {
	const editButton = event.target.closest("[data-edit]");
	const deleteButton = event.target.closest("[data-delete]");
	if (editButton) {
		const product = products.find(item => item.id === editButton.dataset.edit);
		if (product) startEditing(product);
	}
	if (deleteButton) {
		const product = products.find(item => item.id === deleteButton.dataset.delete);
		if (!product || !confirm(`Supprimer « ${product.name} » du catalogue ?`)) return;
		if (await persistProducts(catalog.deleteProduct(product.id), "Produit supprimé du catalogue.")) resetForm();
	}
});

searchInput.addEventListener("input", renderProducts);
document.getElementById("cancel-edit").addEventListener("click", resetForm);
document.getElementById("product-image").addEventListener("input", updateImagePreview);
document.getElementById("image-preview").addEventListener("error", () => {
	document.getElementById("image-preview-wrap").hidden = true;
});
document.getElementById("reset-products").addEventListener("click", async () => {
	if (!confirm("Restaurer les 8 produits d’exemple ? Vos modifications actuelles seront remplacées.")) return;
	if (await persistProducts(catalog.resetProducts(), "Catalogue d’exemple restauré.")) resetForm();
});
window.addEventListener("nova:products-updated", event => {
	products = event.detail;
	renderProducts();
});

function setAdminVisible(isVisible) {
	document.getElementById("admin-login").hidden = isVisible;
	document.getElementById("admin-app").hidden = !isVisible;
	document.getElementById("logout-button").hidden = !isVisible;
	if (isVisible) {
		products = catalog.getProducts();
		renderProducts();
	} else {
		document.getElementById("admin-password").focus();
	}
}

document.getElementById("admin-login-form").addEventListener("submit", async event => {
	event.preventDefault();
	const errorMessage = document.getElementById("login-error");
	errorMessage.hidden = true;
	try {
		await catalog.login(document.getElementById("admin-password").value);
		document.getElementById("admin-password").value = "";
		setAdminVisible(true);
	} catch (error) {
		errorMessage.textContent = error.message;
		errorMessage.hidden = false;
	}
});

document.getElementById("logout-button").addEventListener("click", catalog.logout);
window.addEventListener("nova:admin-auth-required", () => setAdminVisible(false));
window.NovaCatalog.ready.then(async () => {
	setAdminVisible(await catalog.checkAdminSession());
});
