"""
Storage service for E-Rakshak.
Handles file upload, download, and deletion via Supabase Storage.
Requires SUPABASE_URL and SUPABASE_KEY in .env.
"""

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
            if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
                raise RuntimeError(
                    "Supabase Storage not configured: set SUPABASE_URL and SUPABASE_KEY in .env"
                )
            from supabase import create_client
            self._client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return self._client

    def upload_file(self, local_path: str, remote_path: str) -> str:
        """
        Upload a local file to Supabase Storage.
        Returns the public URL of the uploaded file.
        """
        logger.info("storage_upload_start", local_path=local_path, remote_path=remote_path)
        with open(local_path, "rb") as f:
            self.client.storage.from_(self._bucket).upload(
                path=remote_path,
                file=f,
                file_options={"content-type": "text/csv"},
            )
        url = self.get_public_url(remote_path)
        logger.info("storage_upload_complete", remote_path=remote_path, url=url)
        return url

    def download_file(self, remote_path: str, local_path: str) -> None:
        """
        Download a file from Supabase Storage to a local path.
        """
        logger.info("storage_download_start", remote_path=remote_path)
        data = self.client.storage.from_(self._bucket).download(remote_path)
        with open(local_path, "wb") as f:
            f.write(data)
        logger.info("storage_download_complete", remote_path=remote_path, bytes_written=len(data))

    def delete_file(self, remote_path: str) -> None:
        """Delete a single file from Supabase Storage."""
        logger.info("storage_delete_start", remote_path=remote_path)
        self.client.storage.from_(self._bucket).remove([remote_path])
        logger.info("storage_delete_complete", remote_path=remote_path)

    def delete_folder(self, folder_prefix: str) -> int:
        """Delete all files under a folder prefix. Returns count deleted."""
        logger.info("storage_delete_folder_start", folder=folder_prefix)
        files = self.client.storage.from_(self._bucket).list(folder_prefix)
        if not files:
            return 0
        # list() returns bare names: prefix them or nested deletes miss.
        paths = [
            f"{folder_prefix.rstrip('/')}/{f['name']}"
            for f in files
            if f.get("name")
        ]
        if not paths:
            return 0
        self.client.storage.from_(self._bucket).remove(paths)
        logger.info("storage_delete_folder_complete", folder=folder_prefix, count=len(paths))
        return len(paths)

    def get_public_url(self, remote_path: str) -> str:
        """Get the public URL for a file in Supabase Storage."""
        return self.client.storage.from_(self._bucket).get_public_url(remote_path)

    def file_exists(self, remote_path: str) -> bool:
        """Check if a file exists in the bucket."""
        folder, filename = remote_path.rsplit("/", 1) if "/" in remote_path else ("", remote_path)
        files = self.client.storage.from_(self._bucket).list(folder)
        return any(f["name"] == filename for f in files)


# Singleton instance
storage_service = SupabaseStorageService()
