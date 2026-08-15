import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import async_session_maker
from sqlalchemy import select, func
from app.database.models.telecom import SubscriberEventRecordModel, TowerRecordModel

async def run():
    async with async_session_maker() as s:
        # Check subscriber events count
        sub_count = await s.execute(select(func.count(SubscriberEventRecordModel.event_id)))
        print(f"Total SubscriberEventRecord rows in database: {sub_count.scalar()}")

        # Check tower records count
        tower_count = await s.execute(select(func.count(TowerRecordModel.tower_id)))
        print(f"Total TowerRecord rows in database: {tower_count.scalar()}")

        # Print all case IDs in DB again
        from app.database.models.telecom import CaseModel
        cases = (await s.execute(select(CaseModel))).scalars().all()
        for case in cases:
            # check files in this case
            from app.database.models.telecom import UploadMetadataModel
            uploads = (await s.execute(select(UploadMetadataModel).where(UploadMetadataModel.case_id == case.case_id))).scalars().all()
            print(f"\nCase: {case.case_id} | Name: {case.case_name}")
            print(f"  Uploads: {[u.original_filename for u in uploads]}")
            upload_ids = [u.upload_id for u in uploads]
            if upload_ids:
                events_cnt = await s.execute(select(func.count(SubscriberEventRecordModel.event_id)).where(SubscriberEventRecordModel.upload_id.in_(upload_ids)))
                print(f"  SubscriberEventRecords: {events_cnt.scalar()}")

if __name__ == "__main__":
    asyncio.run(run())
