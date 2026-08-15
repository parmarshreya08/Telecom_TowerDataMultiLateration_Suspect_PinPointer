import asyncio
import json
from app.database.session import async_session_maker
from app.database.repository import TelecomRepository

async def check():
    async with async_session_maker() as session:
        repo = TelecomRepository(session)
        cases = await repo.get_all_cases()
        print(f"TOTAL_CASES: {len(cases)}")
        for i, c in enumerate(cases, 1):
            print(f"[{i}] ID: {c['id']} | Name: {c['case_name']} | Status: {c['status']} | Tracking: {c['tracking_status']} | Fixes: {c['fix_count']}")

if __name__ == "__main__":
    asyncio.run(check())
