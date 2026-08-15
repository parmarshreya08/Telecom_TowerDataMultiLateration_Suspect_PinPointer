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
            if "airtel_ground_truth" in u.original_filename or "tower_catalog" in u.original_filename:
                print(f"FOUND: ID: {u.upload_id} | Name: {u.original_filename} | Case: {u.case_id} | Status: {u.upload_status} | Operator: {u.operator}")
                found = True
        if not found:
            print("No matching uploads found at all.")

if __name__ == "__main__":
    asyncio.run(run())
