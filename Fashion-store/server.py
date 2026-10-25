import hmac
import json
import math
import mimetypes
import os
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from uuid import uuid4


ROOT = Path(__file__).resolve().parent
DATABASE_DIR = ROOT / "data"
DATABASE_PATH = DATABASE_DIR / "store.sqlite3"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
PORT = int(os.environ.get("PORT", "4173"))
SESSION_LIFETIME = 12 * 60 * 60
SESSIONS = {}
SESSION_LOCK = threading.Lock()
CATEGORIES = {"femme": "Femme", "homme": "Homme", "accessoires": "Accessoires"}
DEFAULT_PRODUCTS = [
    {"id": "robe-lina", "name": "Robe Lina", "category": "femme", "price": 89, "badge": "Nouveau", "image": "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=800&q=80"},
    {"id": "chemise-sami", "name": "Chemise Sami", "category": "homme", "price": 59, "badge": "Bestseller", "image": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80"},
    {"id": "veste-denim", "name": "Veste en denim", "category": "femme", "price": 120, "badge": "Édition limitée", "image": "https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=800&q=80"},
    {"id": "sac-irma", "name": "Sac Irma", "category": "accessoires", "price": 74, "badge": "Nouveau", "image": "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80"},
    {"id": "tshirt-studio", "name": "T-shirt Studio", "category": "homme", "price": 39, "badge": "Essentiel", "image": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80"},
    {"id": "ensemble-nour", "name": "Ensemble Nour", "category": "femme", "price": 105, "badge": "Coup de cœur", "image": "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=800&q=80"},
    {"id": "lunettes-sola", "name": "Lunettes Sola", "category": "accessoires", "price": 45, "badge": "Nouveau", "image": "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80"},
    {"id": "sneakers-urban", "name": "Sneakers Urban", "category": "homme", "price": 135, "badge": "Bestseller", "image": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80"},
]


@contextmanager
def connect_database():
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    DATABASE_DIR.mkdir(exist_ok=True)
    with connect_database() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute(
            """CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL CHECK(category IN ('femme', 'homme', 'accessoires')),
                price REAL NOT NULL CHECK(price > 0),
                badge TEXT NOT NULL DEFAULT 'Nouveau',
                image TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        seeded = connection.execute(
            "SELECT value FROM settings WHERE key = 'products_seeded'"
        ).fetchone()
        if seeded is None:
            connection.executemany(
                "INSERT INTO products (id, name, category, price, badge, image) VALUES (:id, :name, :category, :price, :badge, :image)",
                DEFAULT_PRODUCTS,
            )
            connection.execute(
                "INSERT INTO settings (key, value) VALUES ('products_seeded', '1')"
            )
            connection.execute(
                "INSERT INTO settings (key, value) VALUES ('catalog_version', '1')"
            )


def product_from_row(row):
    product = dict(row)
    product["categoryLabel"] = CATEGORIES[product["category"]]
    product["price"] = float(product["price"])
    return product


def read_products():
    with connect_database() as connection:
        rows = connection.execute(
            "SELECT id, name, category, price, badge, image FROM products ORDER BY rowid DESC"
        ).fetchall()
        version_row = connection.execute(
            "SELECT value FROM settings WHERE key = 'catalog_version'"
        ).fetchone()
    return [product_from_row(row) for row in rows], int(version_row["value"])


def bump_catalog_version(connection):
    connection.execute(
        "UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'catalog_version'"
    )


def validate_product(payload):
    if not isinstance(payload, dict):
        raise ValueError("Les données du produit sont invalides.")

    name = payload.get("name")
    category = payload.get("category")
    badge = payload.get("badge", "Nouveau")
    image = payload.get("image")
    price_value = payload.get("price")

    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 70:
        raise ValueError("Le nom doit contenir entre 1 et 70 caractères.")
    if category not in CATEGORIES:
        raise ValueError("La catégorie choisie est invalide.")
    if isinstance(price_value, bool):
        raise ValueError("Le prix doit être un nombre supérieur à zéro.")
    try:
        price = float(price_value)
    except (TypeError, ValueError) as error:
        raise ValueError("Le prix doit être un nombre supérieur à zéro.") from error
    if not math.isfinite(price) or price <= 0 or price > 999999:
        raise ValueError("Le prix doit être compris entre 0 et 999 999 DT.")
    if not isinstance(badge, str) or len(badge.strip()) > 32:
        raise ValueError("L’étiquette ne peut pas dépasser 32 caractères.")
    if not isinstance(image, str) or len(image) > 2048:
        raise ValueError("Le lien de l’image est invalide.")
    image_parts = urlsplit(image.strip())
    if image_parts.scheme not in ("http", "https") or not image_parts.netloc:
        raise ValueError("Le lien de l’image doit commencer par https:// ou http://.")

    return {
        "name": name.strip(),
        "category": category,
        "price": price,
        "badge": badge.strip() or "Nouveau",
        "image": image.strip(),
    }


class StoreHandler(BaseHTTPRequestHandler):
    server_version = "NovaStore/1.0"

    def log_message(self, format_string, *args):
        print("%s - %s" % (self.address_string(), format_string % args))

    def send_json(self, status, payload):
        response = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(response)

    def send_api_error(self, status, message):
        self.send_json(status, {"error": message})

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("La requête est invalide.") from error
        if length <= 0 or length > 64 * 1024:
            raise ValueError("La taille des données est invalide.")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Le format des données est invalide.") from error

    def require_admin(self):
        authorization = self.headers.get("Authorization", "")
        token = authorization.removeprefix("Bearer ")
        now = time.monotonic()
        with SESSION_LOCK:
            expires_at = SESSIONS.get(token)
            if expires_at is not None and expires_at > now:
                return True
            SESSIONS.pop(token, None)
        self.send_api_error(401, "Connectez-vous pour gérer les produits.")
        return False

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/products":
            products, version = read_products()
            self.send_json(200, {"products": products, "version": version})
            return
        if path == "/api/admin/session":
            if self.require_admin():
                self.send_json(200, {"authenticated": True})
            return
        self.serve_static(path)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/api/admin/login":
            try:
                payload = self.read_json()
            except ValueError as error:
                self.send_api_error(400, str(error))
                return
            password = payload.get("password") if isinstance(payload, dict) else None
            if not isinstance(password, str) or not hmac.compare_digest(password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")):
                self.send_api_error(401, "Mot de passe incorrect.")
                return
            token = secrets.token_urlsafe(32)
            with SESSION_LOCK:
                SESSIONS[token] = time.monotonic() + SESSION_LIFETIME
            self.send_json(200, {"token": token, "expiresIn": SESSION_LIFETIME})
            return
        if path == "/api/admin/logout":
            if not self.require_admin():
                return
            token = self.headers.get("Authorization", "").removeprefix("Bearer ")
            with SESSION_LOCK:
                SESSIONS.pop(token, None)
            self.send_json(200, {"loggedOut": True})
            return

        if not path.startswith("/api/admin/"):
            self.send_api_error(404, "Route introuvable.")
            return
        if not self.require_admin():
            return
        if path == "/api/admin/reset":
            with connect_database() as connection:
                connection.execute("DELETE FROM products")
                connection.executemany(
                    "INSERT INTO products (id, name, category, price, badge, image) VALUES (:id, :name, :category, :price, :badge, :image)",
                    DEFAULT_PRODUCTS,
                )
                bump_catalog_version(connection)
            self.send_json(200, {"message": "Le catalogue d’exemple a été restauré."})
            return
        if path == "/api/admin/products":
            try:
                product = validate_product(self.read_json())
            except ValueError as error:
                self.send_api_error(400, str(error))
                return
            product["id"] = str(uuid4())
            with connect_database() as connection:
                connection.execute(
                    "INSERT INTO products (id, name, category, price, badge, image) VALUES (:id, :name, :category, :price, :badge, :image)",
                    product,
                )
                bump_catalog_version(connection)
            self.send_json(201, product)
            return
        self.send_api_error(404, "Route introuvable.")

    def do_PUT(self):
        path_parts = urlsplit(self.path).path.strip("/").split("/")
        if len(path_parts) != 4 or path_parts[:3] != ["api", "admin", "products"]:
            self.send_api_error(404, "Route introuvable.")
            return
        if not self.require_admin():
            return
        product_id = unquote(path_parts[3])
        try:
            product = validate_product(self.read_json())
        except ValueError as error:
            self.send_api_error(400, str(error))
            return
        with connect_database() as connection:
            result = connection.execute(
                "UPDATE products SET name = ?, category = ?, price = ?, badge = ?, image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (product["name"], product["category"], product["price"], product["badge"], product["image"], product_id),
            )
            if result.rowcount == 0:
                self.send_api_error(404, "Produit introuvable.")
                return
            bump_catalog_version(connection)
        self.send_json(200, {"id": product_id, **product})

    def do_DELETE(self):
        path_parts = urlsplit(self.path).path.strip("/").split("/")
        if len(path_parts) != 4 or path_parts[:3] != ["api", "admin", "products"]:
            self.send_api_error(404, "Route introuvable.")
            return
        if not self.require_admin():
            return
        product_id = unquote(path_parts[3])
        with connect_database() as connection:
            result = connection.execute("DELETE FROM products WHERE id = ?", (product_id,))
            if result.rowcount == 0:
                self.send_api_error(404, "Produit introuvable.")
                return
            bump_catalog_version(connection)
        self.send_json(200, {"id": product_id})

    def serve_static(self, path):
        if path in ("/", "/index.html"):
            relative_path = "index.html"
        elif path in ("/admin", "/admin/", "/admin/admin.html"):
            relative_path = "admin/admin.html"
        elif path.startswith(("/css/", "/js/", "/images/")):
            relative_path = unquote(path.lstrip("/"))
        else:
            self.send_error(404)
            return

        file_path = (ROOT / relative_path).resolve()
        if ROOT not in file_path.parents or not file_path.is_file():
            self.send_error(404)
            return
        content = file_path.read_bytes()
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        if content_type.startswith(("text/", "application/javascript")):
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        self.send_api_error(405, "Méthode non autorisée.")


def main():
    if len(ADMIN_PASSWORD) < 12:
        raise SystemExit("Définissez un mot de passe ADMIN_PASSWORD de 12 caractères minimum avec start_server.ps1.")
    initialize_database()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), StoreHandler)
    print(f"Boutique : http://127.0.0.1:{PORT}/")
    print(f"Administration : http://127.0.0.1:{PORT}/admin/admin.html")
    print(f"Base SQLite : {DATABASE_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()