"""
Storage service for E-Rakshak.
Handles file upload, download, and deletion.
Uses Supabase Storage when configured; falls back to the local UPLOAD_DIR
when SUPABASE_URL/KEY are absent (keeps the upload flow working offline).
"""

import os
import shutil

from app.core.config import settings
from app.core.logging import logger


class SupabaseStorageService:
    """
    Manages file operations in Supabase Storage.
    Uses service role key for backend operations (bypasses RLS).
    Falls back to local disk storage when Supabase is not configured.
    """

    def __init__(self) -> None:
        self._client = None
        self._bucket: str = settings.SUPABASE_BUCKET

    @property
    def configured(self) -> bool:
        """Whether Supabase credentials are present."""
        return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)

    @property
    def client(self):
        """Lazy-initialize Supabase client."""
        if self._client is None:
            from supabase import create_client
            self._client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return self._client

    def _local_path(self, remote_path: str) -> str:
        """Resolve a remote path to a path inside the local upload dir."""
        root = os.path.abspath(settings.UPLOAD_DIR)
        safe = remote_path.replace("..", "").lstrip("/\\")
        return os.path.join(root, safe)

    def upload_file(self, local_path: str, remote_path: str) -> str:
        """
        Upload a local file to Supabase Storage (or local upload dir).
        Returns the public URL (or local path) of the uploaded file.
        """
        logger.info("storage_upload_start", local_path=local_path, remote_path=remote_path)

        if not self.configured:
            dest = self._local_path(remote_path)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copyfile(local_path, dest)
            logger.info("storage_upload_complete_local", remote_path=remote_path, dest=dest)
            return remote_path

        with open(local_path, "rb") as f:
            self.client.storage.from_(self._bucket).upload(
                path=remote_path,
                file=f,
                file_options={"content-type": "text/csv", "upsert": True},
            )

        url = self.get_public_url(remote_path)
        logger.info("storage_upload_complete", remote_path=remote_path, url=url)
        return url

    def download_file(self, remote_path: str, local_path: str) -> None:
        """
        Download a file from Supabase Storage (or local upload dir) to a local path.
        """
        logger.info("storage_download_start", remote_path=remote_path, local_path=local_path)

        if not self.configured:
            src = self._local_path(remote_path)
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            shutil.copyfile(src, local_path)
            logger.info("storage_download_complete_local", remote_path=remote_path, bytes_written=os.path.getsize(local_path))
            return

        data = self.client.storage.from_(self._bucket).download(remote_path)

        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)

        logger.info("storage_download_complete", remote_path=remote_path, bytes_written=len(data))

    def delete_file(self, remote_path: str) -> None:
        """
        Delete a single file from Supabase Storage (or local upload dir).
        """
        logger.info("storage_delete_start", remote_path=remote_path)

        if not self.configured:
            path = self._local_path(remote_path)
            if os.path.exists(path):
                os.remove(path)
            logger.info("storage_delete_complete_local", remote_path=remote_path)
            return

        self.client.storage.from_(self._bucket).remove([remote_path])
        logger.info("storage_delete_complete", remote_path=remote_path)

    def delete_folder(self, folder_prefix: str) -> int:
        """
        Delete all files under a folder prefix (for case reinitialize).
        Returns the number of files deleted.
        """
        logger.info("storage_delete_folder_start", folder=folder_prefix)

        if not self.configured:
            folder = self._local_path(folder_prefix)
            if not os.path.isdir(folder):
                return 0
            count = 0
            for name in os.listdir(folder):
                path = os.path.join(folder, name)
                if os.path.isfile(path):
                    os.remove(path)
                    count += 1
            logger.info("storage_delete_folder_complete_local", folder=folder_prefix, count=count)
            return count

        files = self.client.storage.from_(self._bucket).list(folder_prefix)
        if not files:
            return 0

        paths = [f["name"] for f in files]
        self.client.storage.from_(self._bucket).remove(paths)

        logger.info("storage_delete_folder_complete", folder=folder_prefix, count=len(paths))
        return len(paths)

    def get_public_url(self, remote_path: str) -> str:
        """
        Get the public URL for a file in Supabase Storage.
        """
        if not self.configured:
            return remote_path
        return self.client.storage.from_(self._bucket).get_public_url(remote_path)

    def file_exists(self, remote_path: str) -> bool:
        """
        Check if a file exists in the bucket (or local upload dir).
        """
        if not self.configured:
            return os.path.exists(self._local_path(remote_path))

        folder = os.path.dirname(remote_path)
        filename = os.path.basename(remote_path)
        files = self.client.storage.from_(self._bucket).list(folder)
        return any(f["name"] == filename for f in files)


# Singleton instance
storage_service = SupabaseStorageService()
