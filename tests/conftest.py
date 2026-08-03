"""
Pytest configuration file.
Provides test fixtures for database session, API client, and sample data.
"""

from typing import AsyncGenerator, Generator
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    """
    Standard synchronous FastAPI TestClient.
    Stubs the startup DB connectivity check so unit tests stay hermetic.
    """
    with patch(
        "app.main.check_database_connection",
        return_value=True
    ), TestClient(app) as c:
        yield c


@pytest.fixture
def mock_db_session() -> AsyncSession:
    """
    Provides a mocked SQLAlchemy AsyncSession.
    """
    # In actual test suites, we can configure sqlite in-memory with:
    # create_async_engine("sqlite+aiosqlite:///:memory:") 
    # and build schemas. Here we return a simple mock/placeholders.
    from unittest.mock import AsyncMock
    session = AsyncMock(spec=AsyncSession)
    return session
