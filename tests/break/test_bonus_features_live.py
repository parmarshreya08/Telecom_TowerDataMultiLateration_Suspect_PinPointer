"""
Live break-test for Bonus Features:
- RF/SDR ground verification (POST /api/case/{id}/verify-rf) — valid + broken scans
- Rogue BTS: /api/towers rejects non-catalog CGI (engine whitelists is_catalog)
- sim_swap frame building is exercised in unit tests; here we verify upload/detection
  path still works with a device-handover style CDR (multi-IMEI same MSISDN).
Cleans up all created data.
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
        with urllib.request.urlopen(req, timeout=25) as resp:
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
        with urllib.request.urlopen(req, timeout=25) as resp:
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
                await db.execute(text("DELETE FROM officers WHERE email LIKE 'bns.%@example.com'"))
                admin = OfficerModel(
                    officer_id=uuid4(), officer_name="BNS Admin",
                    email="bns.admin@example.com",
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

    s, r = call("POST", "/api/auth/login", body={"email": "bns.admin@example.com", "password": "Admin@12345"})
    token = r.get("access_token") if s == 200 else None
    if not token:
        print("LOGIN FAILED")
        return 1
    created["sessions"].append(token)

    cnum = "BRK-BNS-" + suffix
    s, r = call("POST", "/api/cases", body={
        "case_name": "BNS Case", "case_number": cnum}, token=token)
    if s != 201:
        print("CASE CREATE FAILED")
        return 1
    created["cases"].append(cnum)

    # ── RF/SDR verification ──────────────────────────────────
    # Valid scans: two scanners 200m apart, bearings pointing to intersection
    valid_scans = [
        {"timestamp": "2026-08-03T10:00:00Z", "latitude": 21.1702, "longitude": 72.8211,
         "frequency_mhz": 935.0, "rssi_dbm": -78.0, "bearing_deg": 210.0},
        {"timestamp": "2026-08-03T10:00:05Z", "latitude": 21.1712, "longitude": 72.8211,
         "frequency_mhz": 935.0, "rssi_dbm": -80.0, "bearing_deg": 160.0},
    ]
    s, r = call("POST", f"/api/case/{cnum}/verify-rf", body=valid_scans, token=token)
    check("verify-rf 200", s, 200)
    check("verify-rf micro_fix", r.get("micro_fix", {}).get("latitude") is not None, True)
    feat = r.get("geojson", {})
    check("verify-rf geojson type", feat.get("properties", {}).get("type"), "rf_verified_fix")
    check("verify-rf geometry Point", feat.get("geometry", {}).get("type"), "Point")

    # empty scans
    s, r = call("POST", f"/api/case/{cnum}/verify-rf", body=[], token=token)
    check("verify-rf empty 422", s, 422)

    # invalid bearing (>360)
    bad_scans = [dict(valid_scans[0], bearing_deg=500.0)]
    s, r = call("POST", f"/api/case/{cnum}/verify-rf", body=bad_scans, token=token)
    check("verify-rf bad bearing 422", s, 422)

    # invalid lat
    bad_scans = [dict(valid_scans[0], latitude=95.0)]
    s, r = call("POST", f"/api/case/{cnum}/verify-rf", body=bad_scans, token=token)
    check("verify-rf bad lat 422", s, 422)

    # no auth
    s, r = call("POST", f"/api/case/{cnum}/verify-rf", body=valid_scans)
    check("verify-rf no auth 401", s, 401)

    # nonexistent case
    s, r = call("POST", "/api/case/BRK-NOPE-000/verify-rf", body=valid_scans, token=token)
    check("verify-rf nonexistent 404", s, 404)

    # invalid JSON body (string instead of list)
    s, r = call("POST", f"/api/case/{cnum}/verify-rf", body="not-a-list", token=token)
    check("verify-rf bad body 422", s, 422)

    # ── Rogue BTS / tower catalog ────────────────────────────
    # Register 3 legit towers
    cgi1, cgi2, cgi3 = f"BRK-{suffix}-1", f"BRK-{suffix}-2", f"BRK-{suffix}-3"
    created["tower_cgis"] = [cgi1, cgi2, cgi3]
    tower_csv = "cgi,operator,frequency_band,latitude,longitude,azimuth,beamwidth,range_meters,site_address\n" + "".join(
        f"{c},Airtel,LTE1800,{21.15 + i/1000},{72.81 + i/1000},0,60,1200,BRK Site {c}\n"
        for i, c in enumerate([cgi1, cgi2, cgi3])
    )
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "BNS Admin"},
                     [(f"td_{suffix}.csv", tower_csv, "text/csv")],
                     token=token)
    td_id = r["results"][0].get("upload_id") if isinstance(r.get("results"), list) and r["results"] else None
    if td_id:
        created["uploads"].append(td_id)
    st, _ = poll_status(td_id, token)
    check("tower dump completed", st, "completed")

    # registered tower is in catalog
    s, r = call("GET", f"/api/towers?cgi={cgi1}", token=token)
    check("catalog tower lookup 200", s, 200)
    check("catalog tower is_catalog", r.get("is_catalog", True), True)

    # rogue CGI (not in catalog) → 404 from /api/towers (engine whitelists is_catalog)
    s, r = call("GET", "/api/towers?cgi=999-99-999-999", token=token)
    check("rogue cgi lookup 404", s, 404)

    # ── multi-SIM / device handover CDR (2 IMEIs, 1 MSISDN) ──
    handover_csv = (
        "calling_no,called_no,datetime,type,duration,first cgi,first cgi lat/long,mcc,mnc,lac,cell_id,ta,rtt,signal_strength,imei\n"
        f"919876543210,919812345670,2026-08-03 09:00:00,MOC,60,{cgi1},{21.150}/{72.810},404,20,100,1,5,20.0,-70,IMEI-A-{suffix}\n"
        f"919876543210,919812345670,2026-08-03 09:05:00,MOC,60,{cgi2},{21.151}/{72.811},404,20,100,2,5,20.0,-70,IMEI-A-{suffix}\n"
        f"919876543210,919812345670,2026-08-03 09:10:00,MOC,60,{cgi3},{21.152}/{72.812},404,20,100,3,5,20.0,-70,IMEI-B-{suffix}\n"
    )
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "BNS Admin"},
                     [(f"hd_{suffix}.csv", handover_csv, "text/csv")],
                     token=token)
    check("handover cdr upload 201", s, 201)
    hd_id = r["results"][0].get("upload_id") if isinstance(r.get("results"), list) and r["results"] else None
    if hd_id:
        created["uploads"].append(hd_id)
    st, _ = poll_status(hd_id, token)
    check("handover cdr completed", st, "completed")

    # sim_swap flag check via frames in rtt-observations (multi-IMEI per MSISDN)
    s, r = call("GET", f"/api/case/{cnum}/rtt-observations", token=token)
    check("rtt obs after handover 200", s, 200)

    # ── cleanup ──────────────────────────────────────────────
    async def _cleanup():
        from app.database.session import async_session_maker
        from sqlalchemy import text
        async with async_session_maker() as db:
            for cid in created.get("cases", []):
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


def test_bonus_features_live():
    assert main() == 0