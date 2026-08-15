import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import async_session_maker
from sqlalchemy import select
from app.database.models.telecom import UploadMetadataModel

async def run():
    async with async_session_maker() as s:
        res = await s.execute(select(UploadMetadataModel).order_by(UploadMetadataModel.uploaded_at.desc()))
        uploads = res.scalars().all()
        print(f"Total Uploads: {len(uploads)}")
        for u in uploads:
            print(f"- ID: {u.upload_id} | Name: {u.original_filename} | Case: {u.case_id} | Op: {u.operator} | Type: {u.source_type} | Status: {u.upload_status} | Error: {u.error_message}")

if __name__ == "__main__":
    asyncio.run(run())
