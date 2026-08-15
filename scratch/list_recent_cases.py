import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import async_session_maker
from sqlalchemy import select, func
from app.database.models.telecom import CaseModel, UploadMetadataModel, SubscriberEventRecordModel, TowerRecordModel

async def run():
    async with async_session_maker() as s:
        res = await s.execute(select(CaseModel))
        cases = res.scalars().all()
        print(f"Total Cases: {len(cases)}")
        for case in cases:
            # check files in this case
            uploads = (await s.execute(select(UploadMetadataModel).where(UploadMetadataModel.case_id == case.case_id))).scalars().all()
            upload_ids = [u.upload_id for u in uploads]
            events_cnt = 0
            if upload_ids:
                events_cnt = (await s.execute(select(func.count(SubscriberEventRecordModel.event_id)).where(SubscriberEventRecordModel.upload_id.in_(upload_ids)))).scalar()
            
            # Count towers in this case
            towers_cnt = (await s.execute(select(func.count(TowerRecordModel.tower_id)).where(TowerRecordModel.mcc == 404))).scalar() # just dummy check
            
            print(f"- Case: {case.case_id} | Name: {case.case_name} | Created: {case.created_at}")
            print(f"  Uploads: {[(u.original_filename, u.upload_id, u.upload_status, u.operator, u.source_type) for u in uploads]}")
            print(f"  Events Count: {events_cnt}")

if __name__ == "__main__":
    asyncio.run(run())
