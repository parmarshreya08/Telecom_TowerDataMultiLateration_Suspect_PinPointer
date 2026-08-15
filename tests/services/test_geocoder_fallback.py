"""Unit tests verifying geocoding fallback behavior."""

from unittest.mock import patch
from app.services.geocoder import reverse_geocode, clear_cache


class FakeResponse:
    def __init__(self, status_code: int, data: dict) -> None:
        self.status_code = status_code
        self._data = data

    def json(self) -> dict:
        return self._data


def test_reverse_geocode_fallback_with_area():
    clear_cache()
    with patch("app.services.geocoder._http_get", side_effect=Exception("offline")):
        res = reverse_geocode(21.17, 72.82, fallback_area="Udhana")
    assert res == "21.170000, 72.820000 (Udhana)"


def test_reverse_geocode_fallback_without_area():
    clear_cache()
    with patch("app.services.geocoder._http_get", side_effect=Exception("offline")):
        res = reverse_geocode(21.17, 72.82)
    assert res == "21.170000, 72.820000 (Unknown area)"
