"""Integration checks in the isolated rehearsal backend container."""
import asyncio
from datetime import timedelta
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from urllib.parse import urlencode

import psycopg2
from playwright.sync_api import sync_playwright
from websockets.asyncio.client import connect

from app.core.security import create_access_token

context = ssl._create_unverified_context()
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context)
)
with opener.open("https://frontend/", timeout=10) as response:
    assert response.status == 200 and b'<div id="root">' in response.read()
print("PASS: production frontend over HTTPS")
with opener.open("http://backend:8000/health", timeout=5) as response:
    assert json.load(response)["status"] == "healthy"
print("PASS: backend health")
try:
    opener.open("https://frontend/api/v1/users/me", timeout=10)
except urllib.error.HTTPError as error:
    assert error.code in (401, 403), error.code
    assert "detail" in json.load(error)
else:
    raise AssertionError("Authentication unexpectedly allowed an anonymous request")
print("PASS: nginx forwards API and preserves authentication")

with psycopg2.connect(os.environ["DATABASE_URL"]) as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT username FROM users WHERE is_active=true ORDER BY id LIMIT 1")
        username = cursor.fetchone()[0]
        cursor.execute("SELECT id FROM warehouse ORDER BY id LIMIT 1")
        warehouse_id = cursor.fetchone()[0]
token = create_access_token({"sub": username}, expires_delta=timedelta(minutes=1))
request = urllib.request.Request(
    "https://frontend/api/v1/users/me", headers={"Authorization": "Bearer " + token}
)
with opener.open(request, timeout=10) as response:
    assert response.status == 200
print("PASS: authenticated API reads restored user data")


async def websocket_check():
    url = f"wss://frontend/api/v1/ws/warehouse/{warehouse_id}?" + urlencode({"token": token})
    async with connect(url, ssl=context, open_timeout=10) as socket:
        # Waiting for a pong verifies the upgrade and the backend connection.
        waiter = await socket.ping()
        await asyncio.wait_for(waiter, timeout=5)
        await socket.send("rehearsal")


asyncio.run(websocket_check())
print("PASS: secure WebSocket through nginx")
with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.set_content("<html><body>WMS Docker PDF check</body></html>")
    assert page.pdf(format="A4").startswith(b"%PDF-")
    browser.close()
print("PASS: Chromium renders a PDF")

if "--celery" in sys.argv:
    from app.core.celery_app import celery_app

    # Built-in task returns its arguments; it does not access WMS data or ICS.
    for queue in ("logic", "status"):
        result = celery_app.send_task("celery.accumulate", args=[7, 11], queue=queue, expires=30)
        assert list(result.get(timeout=20)) == [7, 11]
        result.forget()
        print(f"PASS: Celery queue {queue} executes a harmless task and returns its result")
