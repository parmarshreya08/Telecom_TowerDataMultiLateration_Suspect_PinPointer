import asyncio
import urllib.request
import json
from uuid import uuid4
from datetime import timedelta
from app.database.session import async_session_maker
from app.database.models import OfficerModel, AuthSessionModel
from app.core.security import create_access_token, generate_jti, ACCESS_TOKEN_EXPIRE_MINUTES
from app.utils.datetime_utils import now_ist
from sqlalchemy import select

async def get_token():
    async with async_session_maker() as db:
        stmt = select(OfficerModel)
        res = await db.execute(stmt)
        officer = res.scalars().first()
        if not officer:
            print("No officer found")
            return None
        
        jti = generate_jti()
        session = AuthSessionModel(
            session_id=uuid4(),
            officer_id=officer.officer_id,
            jti=jti,
            expires_at=now_ist() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        db.add(session)
        await db.commit()
        
        token = create_access_token(str(officer.officer_id), jti)
        return token

async def test():
    token = await get_token()
    if not token:
        return
    
    url = "http://localhost:8000/api/cases"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode("utf-8"))
    
    print(f"TOTAL RETURNED: {data.get('total')}")
    print(f"ITEMS COUNT: {len(data.get('items', []))}")
    print("=" * 90)
    for i, item in enumerate(data.get("items", []), 1):
        c_name = item.get("case_name")
        c_id = item.get("id")
        status = item.get("status")
        tracking = item.get("tracking_status")
        fixes = item.get("fix_count")
        print(f"[{i:02d}] ID: {c_id:<22} | Name: {c_name:<38} | Status: {repr(status):<10} | Tracking: {repr(tracking):<12} | Fixes: {fixes}")

if __name__ == "__main__":
    asyncio.run(test())
