"""
Database session management.
Configures SQLAlchemy AsyncEngine and session makers.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


# Create asynchronous database engine. 
# Uses 'echo' to dump SQL commands when running in debug mode
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True
)

# Async session factory
async_session_maker = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)
AsyncSessionLocal = async_session_maker


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency injection generator yielding an AsyncSession transaction context.
    Automatically rolls back transactions if exceptions bubble up.
    """
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
            
            
async def check_database_connection() -> bool:
    """
    Health check helper to verify database network connectivity.
    """
    try:
        from sqlalchemy import text
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
