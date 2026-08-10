"""
E-Rakshak core configuration and utility functions package.
"""

from app.core.config import settings
from app.core.logging import logger, setup_logging

__all__ = ["settings", "logger", "setup_logging"]
