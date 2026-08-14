"""
Tests for investigation (case) deletion endpoint.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.core.deps import get_current_officer
from app.database.session import get_db_session
from app.main import app


@pytest.fixture
def mock_officer() -> MagicMock:
    officer = MagicMock()
    officer.officer_name = "Test Officer"
    return officer


@pytest.fixture
def case_db_session() -> AsyncMock:
    session = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()
    return session


@pytest.fixture
def client_with_mock_db(case_db_session: AsyncMock, mock_officer: MagicMock) -> TestClient:
    async def override_get_db():
        yield case_db_session

    async def override_officer():
        return mock_officer

    app.dependency_overrides[get_db_session] = override_get_db
    app.dependency_overrides[get_current_officer] = override_officer
    with patch("app.main.check_database_connection", return_value=True):
        with TestClient(app) as test_client:
            yield test_client
    app.dependency_overrides.clear()


def test_delete_case_not_found(client_with_mock_db: TestClient) -> None:
    with patch("app.api.cases.TelecomRepository") as mock_repo_cls:
        mock_repo = mock_repo_cls.return_value
        mock_repo.get_case_by_id = AsyncMock(return_value=None)

        response = client_with_mock_db.delete("/api/case/CASE-MISSING")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Investigation not found."


def test_delete_case_success(client_with_mock_db: TestClient) -> None:
    mock_case = MagicMock()
    mock_case.case_id = "CASE-101"
    mock_upload = MagicMock()
    mock_upload.supabase_path = "CASE-101/uuid-file.csv"

    with patch("app.api.cases.TelecomRepository") as mock_repo_cls:
        mock_repo = mock_repo_cls.return_value
        mock_repo.get_case_by_id = AsyncMock(return_value=mock_case)
        mock_repo.get_uploads_by_case = AsyncMock(return_value=[mock_upload])
        mock_repo.delete_case = AsyncMock(return_value=True)

        with patch("app.api.cases.storage_service.delete_file") as mock_storage_delete:
            response = client_with_mock_db.delete("/api/case/CASE-101")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["case_id"] == "CASE-101"
    mock_storage_delete.assert_called_once_with("CASE-101/uuid-file.csv")
    mock_repo.delete_case.assert_awaited_once_with("CASE-101")


def test_delete_case_db_failure(client_with_mock_db: TestClient) -> None:
    mock_case = MagicMock()
    mock_case.case_id = "CASE-102"

    with patch("app.api.cases.TelecomRepository") as mock_repo_cls:
        mock_repo = mock_repo_cls.return_value
        mock_repo.get_case_by_id = AsyncMock(return_value=mock_case)
        mock_repo.get_uploads_by_case = AsyncMock(return_value=[])
        mock_repo.delete_case = AsyncMock(side_effect=RuntimeError("db error"))

        response = client_with_mock_db.delete("/api/case/CASE-102")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.json()["detail"] == "Failed to delete investigation."
