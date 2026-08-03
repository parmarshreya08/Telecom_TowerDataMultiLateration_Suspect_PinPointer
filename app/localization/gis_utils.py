"""
GIS utilities for E-Rakshak localization engine.
UTM projection round-trips and confidence ellipse GeoJSON generation.
Ported from my_local_work/code/gis_utils.py with automatic UTM zone detection.
"""

import math

import numpy as np
from pyproj import Transformer
from scipy.stats import chi2
from shapely.geometry import Polygon as ShapelyPolygon


class GISUtils:
    _utm_cache = {}

    @staticmethod
    def _zone_for_longitude(lon: float) -> int:
        """
        Derives the UTM zone from a WGS84 longitude.
        UTM zones are 6 degrees wide starting at -180 (zone 1).
        """
        zone = int((lon + 180.0) / 6.0) + 1
        return min(max(zone, 1), 60)

    @staticmethod
    def _get_transformer(zone: int):
        if zone not in GISUtils._utm_cache:
            GISUtils._utm_cache[zone] = Transformer.from_crs(
                "EPSG:4326", f"EPSG:326{zone:02d}", always_xy=True
            )
        return GISUtils._utm_cache[zone]

    @staticmethod
    def _get_inverse_transformer(zone: int):
        if zone not in GISUtils._utm_cache:
            GISUtils._utm_cache[zone] = Transformer.from_crs(
                "EPSG:4326", f"EPSG:326{zone:02d}", always_xy=True
            )
        inv_key = f"inv_{zone}"
        if inv_key not in GISUtils._utm_cache:
            GISUtils._utm_cache[inv_key] = Transformer.from_crs(
                f"EPSG:326{zone:02d}", "EPSG:4326", always_xy=True
            )
        return GISUtils._utm_cache[inv_key]

    @staticmethod
    def latlon_to_utm(lat: float, lon: float, zone: int = 0) -> tuple[float, float, int]:
        """
        Converts WGS84 latitude/longitude to UTM easting/northing.
        When zone is 0 it is auto-derived from the longitude.
        Returns (easting, northing, zone).
        """
        if not zone:
            zone = GISUtils._zone_for_longitude(lon)
        t = GISUtils._get_transformer(zone)
        easting, northing = t.transform(lon, lat)
        return easting, northing, zone

    @staticmethod
    def utm_to_latlon(easting: float, northing: float, zone: int = 0) -> tuple[float, float]:
        """
        Converts UTM easting/northing back to WGS84 (lat, lon).
        """
        t = GISUtils._get_inverse_transformer(zone)
        lon, lat = t.transform(easting, northing)
        return lat, lon

    @staticmethod
    def compute_sector_clipping_centroid(
        tower_coords_utm: np.ndarray,
        distances: np.ndarray,
        azimuths: np.ndarray,
        beamwidths: np.ndarray = None,
    ) -> np.ndarray:
        """
        Computes an initial position guess as the mean of arc-clipped sector midpoints.
        Each tower contributes the midpoint of its azimuth sector at half the measured distance.
        """
        N = len(tower_coords_utm)
        if beamwidths is None:
            beamwidths = np.full(N, 60.0)
        centroids = []
        for i in range(N):
            tx, ty = tower_coords_utm[i]
            r = distances[i]
            az = azimuths[i]
            math_rad = math.radians(90.0 - az)
            mid_x = tx + (r * 0.5) * math.cos(math_rad)
            mid_y = ty + (r * 0.5) * math.sin(math_rad)
            centroids.append([mid_x, mid_y])
        return np.mean(centroids, axis=0)

    @staticmethod
    def generate_confidence_ellipse_geojson(
        center_utm_x: float,
        center_utm_y: float,
        covariance_2d: np.ndarray,
        confidence_level: float = 0.95,
        num_points: int = 36,
        zone: int = 0,
        rss_i_dbm: float = -100.0,
        ta_uncertainty_meters: float = 0.0,
    ) -> dict:
        """
        Builds a GeoJSON Polygon Feature representing a 2D confidence ellipse
        around a localized position, in WGS84 coordinates.

        :param rss_i_dbm: Received Signal Strength Indicator in dBm.
                          Weaker signals widen the ellipse (less confidence).
        :param ta_uncertainty_meters: 1-sigma TA band half-width in meters.
                                      Wider bands widen the ellipse proportionally.
        """
        vals, vecs = np.linalg.eigh(covariance_2d)
        order = vals.argsort()[::-1]
        vals = vals[order]
        vecs = vecs[:, order]
        chi2_scale = np.sqrt(chi2.ppf(confidence_level, 2))
        a = chi2_scale * np.sqrt(max(1e-3, vals[0]))
        b = chi2_scale * np.sqrt(max(1e-3, vals[1]))

        rss_factor = 1.0
        if rss_i_dbm is not None:
            rss_factor = max(1.0, 10 ** ((-50.0 - rss_i_dbm) / 40.0))

        ta_factor = 1.0 + (ta_uncertainty_meters / 100.0)

        a *= rss_factor * ta_factor
        b *= rss_factor * ta_factor

        angle_rad = math.atan2(vecs[1, 0], vecs[0, 0])
        coordinates = []
        t = np.linspace(0, 2 * math.pi, num_points)
        for theta in t:
            ex = a * math.cos(theta)
            ey = b * math.sin(theta)
            rot_x = ex * math.cos(angle_rad) - ey * math.sin(angle_rad)
            rot_y = ex * math.sin(angle_rad) + ey * math.cos(angle_rad)
            utm_x = center_utm_x + rot_x
            utm_y = center_utm_y + rot_y
            lat, lon = GISUtils.utm_to_latlon(utm_x, utm_y, zone)
            coordinates.append([lon, lat])
        coordinates.append(coordinates[0])
        center_lat, center_lon = GISUtils.utm_to_latlon(center_utm_x, center_utm_y, zone)
        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coordinates]},
            "properties": {
                "center_latitude": center_lat,
                "center_longitude": center_lon,
                "semi_major_axis_meters": float(a),
                "semi_minor_axis_meters": float(b),
                "confidence_level": confidence_level,
                "heatmap_weight": 1.0 / (rss_factor * ta_factor),
            },
        }

    @staticmethod
    def generate_sector_wedge_geojson(
        tower_utm_x: float,
        tower_utm_y: float,
        radius_meters: float,
        azimuth_deg: float,
        beamwidth_deg: float,
        zone: int = 0,
        num_arc_points: int = 36,
    ) -> dict:
        """
        Builds a GeoJSON Polygon Feature representing a tower's sector wedge
        (antenna coverage cone) in WGS84 coordinates.
        """
        from app.localization.sector_wedge import make_sector_polygon

        poly_utm = make_sector_polygon(
            tower_utm_x, tower_utm_y, radius_meters,
            azimuth_deg, beamwidth_deg, num_arc_points,
        )
        coords = []
        for x, y in poly_utm.exterior.coords:
            lat, lon = GISUtils.utm_to_latlon(x, y, zone)
            coords.append([lon, lat])

        center_lat, center_lon = GISUtils.utm_to_latlon(tower_utm_x, tower_utm_y, zone)
        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coords]},
            "properties": {
                "tower_latitude": center_lat,
                "tower_longitude": center_lon,
                "azimuth_degrees": azimuth_deg,
                "beamwidth_degrees": beamwidth_deg,
                "radius_meters": radius_meters,
            },
        }


if __name__ == "__main__":
    # Self-test: UTM round-trip (Surat)
    lat, lon = 21.1702, 72.8311
    e, n, zone = GISUtils.latlon_to_utm(lat, lon)
    lat2, lon2 = GISUtils.utm_to_latlon(e, n, zone)
    assert abs(lat - lat2) < 1e-4, f"lat mismatch: {lat} vs {lat2}"
    assert abs(lon - lon2) < 1e-4, f"lon mismatch: {lon} vs {lon2}"
    assert zone == 43, f"expected auto zone 43 for Surat, got {zone}"

    # Self-test: confidence ellipse
    cov = np.array([[100.0, 0.0], [0.0, 50.0]])
    gj = GISUtils.generate_confidence_ellipse_geojson(500000.0, 3000000.0, cov, 0.95, zone=zone)
    assert gj["geometry"]["type"] == "Polygon"
    assert len(gj["geometry"]["coordinates"][0]) == 37
    print(f"gis_utils.py self-test OK (zone={zone}, round-trip={lat2:.4f},{lon2:.4f})")
