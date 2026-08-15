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
        found = False
        for u in uploads:
            if "ground" in u.original_filename.lower() or "catalog" in u.original_filename.lower():
                print(f"FOUND: ID: {u.upload_id} | Name: {u.original_filename} | Case: {u.case_id} | Status: {u.upload_status}")
                found = True
        if not found:
            print("No uploads matching 'ground' or 'catalog' found in DB.")

if __name__ == "__main__":
    asyncio.run(run())
