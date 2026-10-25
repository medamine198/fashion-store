import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

import server


TEST_PASSWORD = "test-password-only-123"


class StoreApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_directory = tempfile.TemporaryDirectory()
        server.DATABASE_DIR = Path(cls.temp_directory.name)
        server.DATABASE_PATH = server.DATABASE_DIR / "test.sqlite3"
        server.ADMIN_PASSWORD = TEST_PASSWORD
        server.initialize_database()
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.StoreHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)
        cls.temp_directory.cleanup()
        server.SESSIONS.clear()

    def api_request(self, method, path, payload=None, token=None):
        headers = {}
        body = None
        if payload is not None:
            body = json.dumps(payload)
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        content = response.read()
        connection.close()
        return response.status, json.loads(content) if content else None

    def get_admin_token(self):
        status, payload = self.api_request(
            "POST", "/api/admin/login", {"password": TEST_PASSWORD}
        )
        self.assertEqual(status, 200)
        return payload["token"]

    def test_public_catalog_returns_seeded_products(self):
        status, payload = self.api_request("GET", "/api/products")
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["products"]), 8)
        self.assertEqual(payload["products"][0]["categoryLabel"], "Homme")

    def test_admin_session_is_removed_on_logout(self):
        token = self.get_admin_token()
        status, payload = self.api_request("GET", "/api/admin/session", token=token)
        self.assertEqual(status, 200)
        self.assertTrue(payload["authenticated"])

        status, _ = self.api_request("POST", "/api/admin/logout", {}, token)
        self.assertEqual(status, 200)
        status, _ = self.api_request("GET", "/api/admin/session", token=token)
        self.assertEqual(status, 401)

    def test_admin_changes_persist_and_require_authentication(self):
        product = {
            "name": "Produit de test",
            "category": "femme",
            "price": 42.5,
            "badge": "Test",
            "image": "https://example.com/product.jpg",
        }
        status, _ = self.api_request("POST", "/api/admin/products", product)
        self.assertEqual(status, 401)

        token = self.get_admin_token()
        status, created = self.api_request("POST", "/api/admin/products", product, token)
        self.assertEqual(status, 201)
        product_id = created["id"]

        updated_product = {**product, "price": 55}
        status, _ = self.api_request(
            "PUT", f"/api/admin/products/{product_id}", updated_product, token
        )
        self.assertEqual(status, 200)
        status, catalog = self.api_request("GET", "/api/products")
        saved_product = next(item for item in catalog["products"] if item["id"] == product_id)
        self.assertEqual(saved_product["price"], 55)

        status, _ = self.api_request(
            "DELETE", f"/api/admin/products/{product_id}", token=token
        )
        self.assertEqual(status, 200)

        status, _ = self.api_request("POST", "/api/admin/reset", {}, token)
        self.assertEqual(status, 200)
        status, catalog = self.api_request("GET", "/api/products")
        self.assertEqual(len(catalog["products"]), 8)


if __name__ == "__main__":
    unittest.main()
