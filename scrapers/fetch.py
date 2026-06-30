from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import requests

from .extract import page_title, soup_from_html


DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,image/avif,image/webp,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


@dataclass
class FetchResult:
    url: str
    final_url: str
    status_code: int
    content_type: str
    content: bytes
    text: str
    fetched_at: str
    sha256: str

    def to_page_row(self) -> dict[str, Any]:
        content_type = (self.content_type or "").lower()
        is_pdf = "application/pdf" in content_type or self.final_url.lower().endswith(".pdf")
        soup = soup_from_html(self.text) if not is_pdf and ("html" in self.content_type or self.text.startswith("<")) else None
        return {
            "url": self.url,
            "final_url": self.final_url,
            "status_code": self.status_code,
            "content_type": self.content_type,
            "title": page_title(soup) if soup else None,
            "fetched_at": self.fetched_at,
            "sha256": self.sha256,
            "html": None if is_pdf else self.text,
        }


class Fetcher:
    def __init__(self, delay_seconds: float = 0.75, timeout: int = 30) -> None:
        self.delay_seconds = delay_seconds
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self._last_request_at = 0.0

    def get(self, url: str) -> FetchResult:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.delay_seconds:
            time.sleep(self.delay_seconds - elapsed)
        response = self.session.get(url, timeout=self.timeout)
        self._last_request_at = time.monotonic()
        content = response.content
        text = response.text
        return FetchResult(
            url=url,
            final_url=response.url,
            status_code=response.status_code,
            content_type=response.headers.get("content-type", ""),
            content=content,
            text=text,
            fetched_at=datetime.now(timezone.utc).isoformat(),
            sha256=hashlib.sha256(content).hexdigest(),
        )
