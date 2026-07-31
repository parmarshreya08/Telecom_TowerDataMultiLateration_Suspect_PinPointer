"""
Unit tests for the health check endpoint.
"""

from unittest.mock import patch
from fastapi import status
from fastapi.testclient import TestClient


def test_health_check_healthy(client: TestClient) -> None:
    """
    Ensures health status returns 200 OK when database is accessible.
    """
    # Mock database verification helper to return True
    with patch("app.api.health.check_database_connection", return_value=True):
        response = client.get("/health")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        assert "timestamp" in data


def test_health_check_degraded(client: TestClient) -> None:
    """
    Ensures health status returns 503 SERVICE UNAVAILABLE when database is down.
    """
    # Mock database verification helper to return False
    with patch("app.api.health.check_database_connection", return_value=False):
        response = client.get("/health")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        data = response.json()
        assert data["status"] == "degraded"
        assert data["database"] == "unreachable"
        assert "timestamp" in data
