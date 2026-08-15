"""
Tests for single-file deletion endpoint.
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
    officer.officer_id = uuid4()
    officer.officer_name = "Test Officer"
    officer.email = "test@erakshak.gov.in"
    officer.role = "ADMIN"
    officer.is_active = True
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


def test_delete_file_not_found(client_with_mock_db: TestClient) -> None:
    with patch("app.api.files.TelecomRepository") as mock_repo_cls:
        mock_repo = mock_repo_cls.return_value
        mock_repo.get_upload_by_id = AsyncMock(return_value=None)

        response = client_with_mock_db.delete(f"/api/file/{uuid4()}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_delete_file_success(client_with_mock_db: TestClient) -> None:
    upload_id = uuid4()
    mock_upload = MagicMock()
    mock_upload.supabase_path = "CASE-1/file.csv"

    with patch("app.api.files.TelecomRepository") as mock_repo_cls:
        mock_repo = mock_repo_cls.return_value
        mock_repo.get_upload_by_id = AsyncMock(return_value=mock_upload)
        mock_repo.delete_upload = AsyncMock(return_value=True)

        with patch("app.api.files.storage_service.delete_file") as mock_storage_delete:
            response = client_with_mock_db.delete(f"/api/file/{upload_id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["message"] == "File deleted successfully"
    mock_storage_delete.assert_called_once_with("CASE-1/file.csv")
    mock_repo.delete_upload.assert_awaited_once_with(upload_id)
