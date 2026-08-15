"""
Geocoder service tests: grid-cache keys, network-failure fallback,
label extraction, and FeatureCollection attachment.
"""

from unittest.mock import patch

from app.services import geocoder


class FakeResponse:
    def __init__(self, status_code: int, data: dict) -> None:
        self.status_code = status_code
        self._data = data

    def json(self) -> dict:
        return self._data


ADDRESS_DATA = {
    "display_name": "Adajan Road, Adajan, Surat, Gujarat, India",
    "address": {"road": "Adajan Road", "suburb": "Adajan", "city": "Surat"},
}


def test_grid_key_rounds_nearby_points_to_same_cell():
    a = geocoder._grid_key(21.17021, 72.82111)
    b = geocoder._grid_key(21.17032, 72.82124)
    assert a == b


def test_label_combines_multiple_address_elements():
    assert geocoder._label_from_address(ADDRESS_DATA) == "Adajan Road, Adajan, Surat"


def test_label_falls_back_to_display_name_full():
    data = {"display_name": "Surat, Gujarat, India", "address": {}}
    assert geocoder._label_from_address(data) == "Surat, Gujarat, India"


def test_network_failure_returns_coordinate_fallback():
    geocoder.clear_cache()
    with patch.object(geocoder, "_http_get", side_effect=Exception("offline")):
        label = geocoder.reverse_geocode(21.17, 72.82)
    assert label == "21.170000, 72.820000 (Unknown area)"
    assert geocoder._cache


def test_network_failure_returns_coordinate_with_fallback_area():
    geocoder.clear_cache()
    with patch.object(geocoder, "_http_get", side_effect=Exception("offline")):
        label = geocoder.reverse_geocode(21.17, 72.82, fallback_area="Udhana")
    assert label == "21.170000, 72.820000 (Udhana)"


def test_success_parses_and_caches():
    geocoder.clear_cache()
    with patch.object(geocoder, "_http_get", return_value=FakeResponse(200, ADDRESS_DATA)) as mock_get:
        first = geocoder.reverse_geocode(21.1702, 72.8211)
        second = geocoder.reverse_geocode(21.17021, 72.82111)
    assert first == "Adajan Road, Adajan, Surat"
    assert second == "Adajan Road, Adajan, Surat"
    assert mock_get.call_count == 1, "second call must hit the grid cache"


def test_attach_geocodes_sets_point_properties():
    geocoder.clear_cache()
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [72.8211, 21.1702]},
                "properties": {},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[72, 21], [73, 21], [73, 22], [72, 22], [72, 21]]]},
                "properties": {},
            },
        ],
    }
    with patch.object(geocoder, "_http_get", return_value=FakeResponse(200, ADDRESS_DATA)):
        result = geocoder.attach_geocodes(geojson)
    assert result["features"][0]["properties"]["geocode"] == "Adajan Road, Adajan, Surat"
    assert "geocode" not in result["features"][1]["properties"], "polygons must be skipped"