"""
Supabase Storage service for E-Rakshak.
Handles file upload, download, and deletion in Supabase Storage.
"""

import os
from typing import Optional

from app.core.config import settings
from app.core.logging import logger


class SupabaseStorageService:
    """
    Manages file operations in Supabase Storage.
    Uses service role key for backend operations (bypasses RLS).
    """

    def __init__(self) -> None:
        self._client = None
        self._bucket: str = settings.SUPABASE_BUCKET

    @property
    def client(self):
        """Lazy-initialize Supabase client."""
        if self._client is None:
            from supabase import create_client
            self._client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return self._client

    def upload_file(self, local_path: str, remote_path: str) -> str:
        """
        Upload a local file to Supabase Storage.
        Returns the public URL of the uploaded file.
        """
        logger.info("supabase_upload_start", local_path=local_path, remote_path=remote_path)

        with open(local_path, "rb") as f:
            result = self.client.storage.from_(self._bucket).upload(
                path=remote_path,
                file=f,
                file_options={"content-type": "text/csv", "upsert": True},
            )

        url = self.get_public_url(remote_path)
        logger.info("supabase_upload_complete", remote_path=remote_path, url=url)
        return url

    def download_file(self, remote_path: str, local_path: str) -> None:
        """
        Download a file from Supabase Storage to a local path.
        """
        logger.info("supabase_download_start", remote_path=remote_path, local_path=local_path)

        data = self.client.storage.from_(self._bucket).download(remote_path)

        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)

        logger.info("supabase_download_complete", remote_path=remote_path, bytes_written=len(data))

    def delete_file(self, remote_path: str) -> None:
        """
        Delete a single file from Supabase Storage.
        """
        logger.info("supabase_delete_start", remote_path=remote_path)
        self.client.storage.from_(self._bucket).remove([remote_path])
        logger.info("supabase_delete_complete", remote_path=remote_path)

    def delete_folder(self, folder_prefix: str) -> int:
        """
        Delete all files under a folder prefix (for case reinitialize).
        Returns the number of files deleted.
        """
        logger.info("supabase_delete_folder_start", folder=folder_prefix)

        files = self.client.storage.from_(self._bucket).list(folder_prefix)
        if not files:
            return 0

        paths = [f["name"] for f in files]
        self.client.storage.from_(self._bucket).remove(paths)

        logger.info("supabase_delete_folder_complete", folder=folder_prefix, count=len(paths))
        return len(paths)

    def get_public_url(self, remote_path: str) -> str:
        """
        Get the public URL for a file in Supabase Storage.
        """
        result = self.client.storage.from_(self._bucket).get_public_url(remote_path)
        return result

    def file_exists(self, remote_path: str) -> bool:
        """
        Check if a file exists in the bucket.
        """
        folder = os.path.dirname(remote_path)
        filename = os.path.basename(remote_path)
        files = self.client.storage.from_(self._bucket).list(folder)
        return any(f["name"] == filename for f in files)


# Singleton instance
storage_service = SupabaseStorageService()
