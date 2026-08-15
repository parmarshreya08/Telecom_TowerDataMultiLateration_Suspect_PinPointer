"""
Live break-test for the Ingestion Pipeline (detect → extract → validate →
normalize → frame build) driven end-to-end through the real HTTP upload +
background ingest queue against Neon. Verifies upload status transitions and
DB records, then cleans up all created data (including global tower catalog rows).
"""

import asyncio
import json
import random
import string
import sys
import time
import urllib.request

import pytest

pytestmark = pytest.mark.skipif(
    not __import__("socket").socket().connect_ex(("127.0.0.1", 8000)) == 0,
    reason="Backend not running on :8000",
)

BASE = "http://localhost:8000"
PASS = 0
FAIL = 0


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "null")
        except Exception:
            return e.code, {}


def multipart(path, fields, files, token=None):
    import uuid as _u
    boundary = "----brk" + _u.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode()
        body += f"{v}\r\n".encode()
    for fname, content, ctype in files:
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="files"; filename="{fname}"\r\n'.encode()
        body += f"Content-Type: {ctype}\r\n\r\n".encode()
        body += content.encode("utf-8")
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "null")
        except Exception:
            return e.code, {}


def check(name, got, want):
    global PASS, FAIL
    ok = got == want
    PASS += 1 if ok else 0
    FAIL += 1 if not ok else 0
    print(("PASS " if ok else "FAIL ") + name + f"  [got={got} want={want}]")


def poll_status(upload_id, token, timeout_s=60):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        s, r = call("GET", f"/api/file/{upload_id}/status", token=token)
        if s == 200:
            st = r.get("upload_status")
            if st in ("completed", "failed"):
                return st, r
        time.sleep(2)
    return "timeout", {}


def main():
    created = {"officers": [], "cases": [], "uploads": [], "tower_cgis": [], "sessions": []}
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))

    try:
        from dotenv import load_dotenv
        from uuid import uuid4
        load_dotenv()

        async def _bootstrap():
            from app.core.security import hash_password
            from app.database.models import OfficerModel
            from app.database.session import async_session_maker
            from sqlalchemy import text
            async with async_session_maker() as db:
                await db.execute(text("DELETE FROM officers WHERE email LIKE 'ing.%@example.com'"))
                admin = OfficerModel(
                    officer_id=uuid4(), officer_name="ING Admin",
                    email="ing.admin@example.com",
                    password_hash=hash_password("Admin@12345"),
                    role="ADMIN", is_active=True)
                db.add(admin)
                await db.commit()
                return str(admin.officer_id)
        admin_id = asyncio.run(_bootstrap())
        from app.database.session import engine as _eng
        async def _dispose():
            await _eng.dispose()
        asyncio.run(_dispose())
        created["officers"] = [admin_id]
    except Exception as e:
        print("BOOTSTRAP FAILED:", e)
        return 1

    s, r = call("POST", "/api/auth/login", body={"email": "ing.admin@example.com", "password": "Admin@12345"})
    token = r.get("access_token") if s == 200 else None
    if not token:
        print("LOGIN FAILED")
        return 1
    created["sessions"].append(token)

    cnum = "BRK-ING-" + suffix
    s, r = call("POST", "/api/cases", body={
        "case_name": "ING Case", "case_number": cnum}, token=token)
    if s != 201:
        print("CASE CREATE FAILED")
        return 1
    created["cases"].append(cnum)

    # ── tower dump with unique CGIs ──────────────────────────
    cgi1, cgi2, cgi3 = f"BRK-{suffix}-1", f"BRK-{suffix}-2", f"BRK-{suffix}-3"
    created["tower_cgis"] = [cgi1, cgi2, cgi3]
    tower_csv = (
        "cgi,operator,frequency_band,latitude,longitude,azimuth,beamwidth,range_meters,site_address\n"
        f"{cgi1},Airtel,LTE1800,21.1500,72.8100,0,60,1200,BRK Site 1\n"
        f"{cgi2},Airtel,LTE1800,21.1550,72.8150,120,60,1200,BRK Site 2\n"
        f"{cgi3},Airtel,LTE1800,21.1600,72.8200,240,60,1200,BRK Site 3\n"
    )
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "ING Admin"},
                     [(f"tower_dump_{suffix}.csv", tower_csv, "text/csv")],
                     token=token)
    check("tower dump upload 201", s, 201)
    tower_upload_id = None
    if isinstance(r.get("results"), list) and r["results"]:
        tower_upload_id = r["results"][0].get("upload_id")
        created["uploads"].append(tower_upload_id)

    st, _ = poll_status(tower_upload_id, token)
    check("tower dump status completed", st, "completed")

    # ── CDR referencing those towers ─────────────────────────
    cdr_csv = (
        "calling_no,called_no,datetime,type,duration,first cgi,first cgi lat/long,mcc,mnc,lac,cell_id,ta,rtt,signal_strength\n"
        f"919876543210,919812345670,2026-08-01 08:00:00,MOC,120,{cgi1},21.1500/72.8100,404,20,100,1,15,58.0,-75\n"
        f"919876543210,919812345670,2026-08-01 08:02:00,MOC,90,{cgi2},21.1550/72.8150,404,20,100,2,12,47.0,-80\n"
        f"919876543210,919812345670,2026-08-01 08:04:00,MOC,60,{cgi3},21.1600/72.8200,404,20,100,3,9,35.0,-85\n"
    )
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "ING Admin"},
                     [(f"cdr_{suffix}.csv", cdr_csv, "text/csv")],
                     token=token)
    check("cdr upload 201", s, 201)
    cdr_upload_id = None
    if isinstance(r.get("results"), list) and r["results"]:
        cdr_upload_id = r["results"][0].get("upload_id")
        created["uploads"].append(cdr_upload_id)

    st, _ = poll_status(cdr_upload_id, token)
    check("cdr status completed", st, "completed")

    # ── verify records in DB ─────────────────────────────────
    s, r = call("GET", f"/api/case/{cnum}/events", token=token)
    check("case events 200", s, 200)
    check("3 subscriber events", r.get("total", r.get("events_total", 0)), 3)

    # ── corrupt file → upload OK but ingestion fails ─────────
    corrupt_csv = "no,valid,headers\n1,2,3\n"
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "ING Admin"},
                     [(f"corrupt_{suffix}.csv", corrupt_csv, "text/csv")],
                     token=token)
    check("corrupt upload 201", s, 201)
    corrupt_id = r["results"][0].get("upload_id")
    if corrupt_id:
        created["uploads"].append(corrupt_id)
        st, st_r = poll_status(corrupt_id, token)
        # Either failed (strict) or completed with 0 valid rows — both acceptable
        check("corrupt file processed (failed or completed)", st in ("failed", "completed"), True)
        if st == "completed":
            s, r = call("GET", f"/api/file/{corrupt_id}/status", token=token)

    # ── duplicate upload blocked by hash ─────────────────────
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "ING Admin"},
                     [(f"tower_dump_{suffix}.csv", tower_csv, "text/csv")],
                     token=token)
    check("duplicate tower dump rejected", r.get("rejected", 0), 1)

    # ── cleanup ──────────────────────────────────────────────
    async def _cleanup():
        from app.database.session import async_session_maker
        from sqlalchemy import text
        async with async_session_maker() as db:
            for cid in created.get("cases", []):
                # measurement_towers/frames/events link via upload_id, not case_id
                await db.execute(text(
                    'DELETE FROM measurement_towers WHERE frame_id IN '
                    '(SELECT frame_id FROM measurement_frames WHERE upload_id IN '
                    '(SELECT upload_id FROM upload_metadata WHERE case_id = :c))'), {"c": cid})
                await db.execute(text(
                    'DELETE FROM measurement_frames WHERE upload_id IN '
                    '(SELECT upload_id FROM upload_metadata WHERE case_id = :c)'), {"c": cid})
                await db.execute(text(
                    'DELETE FROM subscriber_event_records WHERE upload_id IN '
                    '(SELECT upload_id FROM upload_metadata WHERE case_id = :c)'), {"c": cid})
                await db.execute(text('DELETE FROM upload_metadata WHERE case_id = :c'), {"c": cid})
                await db.execute(text('DELETE FROM case_assignments WHERE case_id = :c'), {"c": cid})
                await db.execute(text('DELETE FROM localization_fixes WHERE case_id = :c'), {"c": cid})
                await db.execute(text('DELETE FROM cases WHERE case_id = :c'), {"c": cid})
            for cgi in created.get("tower_cgis", []):
                await db.execute(text('DELETE FROM tower_records WHERE cgi = :c'), {"c": cgi})
            for oid in created.get("officers", []):
                await db.execute(text('DELETE FROM auth_sessions WHERE officer_id = :o'), {"o": oid})
                await db.execute(text('DELETE FROM case_assignments WHERE officer_id = :o'), {"o": oid})
                await db.execute(text('DELETE FROM audit_logs WHERE actor_id = :o'), {"o": oid})
                await db.execute(text('DELETE FROM officers WHERE officer_id = :o'), {"o": oid})
            await db.commit()
    try:
        asyncio.run(_cleanup())
    except Exception as e:
        print("CLEANUP ISSUE:", e)

    print(f"\nRESULT: {PASS} passed, {FAIL} failed")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())


def test_ingestion_live():
    assert main() == 0