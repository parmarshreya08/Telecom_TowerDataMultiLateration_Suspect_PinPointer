import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import async_session_maker
from sqlalchemy import select
from app.database.models.telecom import UploadMetadataModel

async def run():
    async with async_session_maker() as s:
        res = await s.execute(select(UploadMetadataModel))
        uploads = res.scalars().all()
        print(f"Total Uploads: {len(uploads)}")
        for u in uploads:
            print(f"ID: {repr(u.upload_id)} | Type: {type(u.upload_id)} | File: {u.original_filename} | Case: {u.case_id}")

if __name__ == "__main__":
    asyncio.run(run())
