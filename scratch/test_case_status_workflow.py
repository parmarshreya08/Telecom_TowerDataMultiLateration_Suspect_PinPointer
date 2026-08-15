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
        
        return create_access_token(str(officer.officer_id), jti)

def api_request(url, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

async def run_workflow_test():
    token = await get_token()
    if not token:
        print("Failed to get auth token")
        return

    test_case_id = "CASE-VERIFY-2DF50F54"
    print(f"============================================================")
    print(f"TESTING CASE LIFECYCLE STATUS WORKFLOW ON {test_case_id}")
    print(f"============================================================")

    # 1. Check initial detail
    st, initial_detail = api_request(f"http://localhost:8000/api/case/{test_case_id}", token=token)
    print(f"\n1. Initial Case Detail: Status={initial_detail.get('status')}, Tracking={initial_detail.get('tracking_status')}")
    assert st == 200, f"Expected 200, got {st}"

    # 2. Update to Pending
    print("\n2. Updating Active -> Pending...")
    st, resp = api_request(f"http://localhost:8000/api/case/{test_case_id}/status", method="PATCH", data={"status": "Pending"}, token=token)
    print(f"   Response ({st}): {resp}")
    assert st == 200 and resp.get("status") == "Pending"

    # Verify detail
    st, detail = api_request(f"http://localhost:8000/api/case/{test_case_id}", token=token)
    print(f"   Verified Case Detail: Status={detail.get('status')}, Tracking={detail.get('tracking_status')}")
    assert detail.get("status") == "Pending"

    # Verify list
    st, case_list = api_request("http://localhost:8000/api/cases", token=token)
    matched = [c for c in case_list.get("items", []) if c.get("id") == test_case_id][0]
    print(f"   Verified in Case List: ID={matched.get('id')}, Status={matched.get('status')}")
    assert matched.get("status") == "Pending"

    # 3. Update to Completed
    print("\n3. Updating Pending -> Completed...")
    st, resp = api_request(f"http://localhost:8000/api/case/{test_case_id}/status", method="PATCH", data={"status": "Completed"}, token=token)
    print(f"   Response ({st}): {resp}")
    assert st == 200 and resp.get("status") == "Completed"

    st, detail = api_request(f"http://localhost:8000/api/case/{test_case_id}", token=token)
    print(f"   Verified Case Detail: Status={detail.get('status')}, Tracking={detail.get('tracking_status')}")
    assert detail.get("status") == "Completed"

    # 4. Update to Archived
    print("\n4. Updating Completed -> Archived...")
    st, resp = api_request(f"http://localhost:8000/api/case/{test_case_id}/status", method="PATCH", data={"status": "Archived"}, token=token)
    print(f"   Response ({st}): {resp}")
    assert st == 200 and resp.get("status") == "Archived"

    st, detail = api_request(f"http://localhost:8000/api/case/{test_case_id}", token=token)
    print(f"   Verified Case Detail: Status={detail.get('status')}, Tracking={detail.get('tracking_status')}")
    assert detail.get("status") == "Archived"

    # 5. Restore to Active
    print("\n5. Restoring Archived -> Active...")
    st, resp = api_request(f"http://localhost:8000/api/case/{test_case_id}/status", method="PATCH", data={"status": "Active"}, token=token)
    print(f"   Response ({st}): {resp}")
    assert st == 200 and resp.get("status") == "Active"

    st, detail = api_request(f"http://localhost:8000/api/case/{test_case_id}", token=token)
    print(f"   Verified Case Detail: Status={detail.get('status')}, Tracking={detail.get('tracking_status')}")
    assert detail.get("status") == "Active"

    # 6. Test Invalid Status Validation
    print("\n6. Testing invalid status validation...")
    st, err_resp = api_request(f"http://localhost:8000/api/case/{test_case_id}/status", method="PATCH", data={"status": "BogusStatus"}, token=token)
    print(f"   Response ({st}): {err_resp}")
    assert st == 400, f"Expected 400 Bad Request, got {st}"

    print("\n============================================================")
    print("ALL STATUS WORKFLOW TESTS PASSED SUCCESSFULLY!")
    print("============================================================")

if __name__ == "__main__":
    asyncio.run(run_workflow_test())
