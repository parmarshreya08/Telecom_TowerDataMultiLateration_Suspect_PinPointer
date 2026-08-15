import asyncio
import json
from uuid import uuid4
from datetime import timedelta
import httpx
from sqlalchemy import select

from app.main import app
from app.database.session import async_session_maker
from app.database.models import OfficerModel, AuthSessionModel
from app.core.security import create_access_token, generate_jti, ACCESS_TOKEN_EXPIRE_MINUTES
from app.utils.datetime_utils import now_ist

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
        
        return create_access_token(str(officer.officer_id), jti)

async def run_tests():
    token = await get_token()
    assert token, "Failed to get auth token"
    headers = {"Authorization": f"Bearer {token}"}
    test_case_id = "CASE-VERIFY-2DF50F54"

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        print("=" * 70)
        print(f"TESTING STATUS UPDATE WORKFLOW FOR CASE: {test_case_id}")
        print("=" * 70)

        # 1. Initial State
        r = await client.get(f"/api/case/{test_case_id}", headers=headers)
        assert r.status_code == 200, f"Detail failed: {r.text}"
        data = r.json()
        print(f"1. Initial Detail: Status='{data.get('status')}', Tracking='{data.get('tracking_status')}'")

        # 2. Update to Pending
        print("\n2. Updating Active -> Pending...")
        r = await client.patch(f"/api/case/{test_case_id}/status", json={"status": "Pending"}, headers=headers)
        assert r.status_code == 200, f"Patch failed: {r.text}"
        res = r.json()
        print(f"   PATCH response: {res}")
        assert res.get("status") == "Pending"

        # Verify Detail
        r = await client.get(f"/api/case/{test_case_id}", headers=headers)
        detail = r.json()
        print(f"   Verified Detail: Status='{detail.get('status')}', Tracking='{detail.get('tracking_status')}'")
        assert detail.get("status") == "Pending"

        # Verify List
        r = await client.get("/api/cases", headers=headers)
        cases = r.json().get("items", [])
        matched = [c for c in cases if c.get("id") == test_case_id][0]
        print(f"   Verified Case List: ID='{matched.get('id')}', Status='{matched.get('status')}'")
        assert matched.get("status") == "Pending"

        # 3. Update to Completed
        print("\n3. Updating Pending -> Completed...")
        r = await client.patch(f"/api/case/{test_case_id}/status", json={"status": "Completed"}, headers=headers)
        assert r.status_code == 200
        res = r.json()
        print(f"   PATCH response: {res}")
        assert res.get("status") == "Completed"

        r = await client.get(f"/api/case/{test_case_id}", headers=headers)
        detail = r.json()
        print(f"   Verified Detail: Status='{detail.get('status')}', Tracking='{detail.get('tracking_status')}'")
        assert detail.get("status") == "Completed"

        # 4. Update to Archived
        print("\n4. Updating Completed -> Archived...")
        r = await client.patch(f"/api/case/{test_case_id}/status", json={"status": "Archived"}, headers=headers)
        assert r.status_code == 200
        res = r.json()
        print(f"   PATCH response: {res}")
        assert res.get("status") == "Archived"

        r = await client.get(f"/api/case/{test_case_id}", headers=headers)
        detail = r.json()
        print(f"   Verified Detail: Status='{detail.get('status')}', Tracking='{detail.get('tracking_status')}'")
        assert detail.get("status") == "Archived"

        # 5. Restore to Active
        print("\n5. Restoring Archived -> Active...")
        r = await client.patch(f"/api/case/{test_case_id}/status", json={"status": "Active"}, headers=headers)
        assert r.status_code == 200
        res = r.json()
        print(f"   PATCH response: {res}")
        assert res.get("status") == "Active"

        r = await client.get(f"/api/case/{test_case_id}", headers=headers)
        detail = r.json()
        print(f"   Verified Detail: Status='{detail.get('status')}', Tracking='{detail.get('tracking_status')}'")
        assert detail.get("status") == "Active"

        # 6. Test Invalid Status Validation
        print("\n6. Testing validation with invalid status ('InvalidStatus')...")
        r = await client.patch(f"/api/case/{test_case_id}/status", json={"status": "InvalidStatus"}, headers=headers)
        print(f"   Response status: {r.status_code}, error body: {r.json()}")
        assert r.status_code == 400

        print("\n" + "=" * 70)
        print("ALL TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_tests())
