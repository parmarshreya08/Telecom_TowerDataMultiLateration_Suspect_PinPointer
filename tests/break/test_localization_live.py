"""
Live break-test for the Localization group: run localize over a case with real
ingested geometry (tower dump + CDR forming a 3-tower triangle), then verify
GeoJSON, heatmap, RTT observations, report, and CSV/KML/PDF exports.
Cleans up all created data afterwards.
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


def raw_get(path, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode("utf-8", errors="replace")
        except Exception:
            return e.code, ""


def check(name, got, want):
    global PASS, FAIL
    ok = got == want
    PASS += 1 if ok else 0
    FAIL += 1 if not ok else 0
    print(("PASS " if ok else "FAIL ") + name + f"  [got={got} want={want}]")


def poll_status(upload_id, token, timeout_s=90):
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
                await db.execute(text("DELETE FROM officers WHERE email LIKE 'loc.%@example.com'"))
                admin = OfficerModel(
                    officer_id=uuid4(), officer_name="LOC Admin",
                    email="loc.admin@example.com",
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

    s, r = call("POST", "/api/auth/login", body={"email": "loc.admin@example.com", "password": "Admin@12345"})
    token = r.get("access_token") if s == 200 else None
    if not token:
        print("LOGIN FAILED")
        return 1
    created["sessions"].append(token)

    cnum = "BRK-LOC-" + suffix
    s, r = call("POST", "/api/cases", body={
        "case_name": "LOC Case", "case_number": cnum}, token=token)
    if s != 201:
        print("CASE CREATE FAILED")
        return 1
    created["cases"].append(cnum)

    # Towers forming a triangle ~1.2km apart (trilateration-friendly)
    cgi1, cgi2, cgi3 = f"BRK-{suffix}-1", f"BRK-{suffix}-2", f"BRK-{suffix}-3"
    created["tower_cgis"] = [cgi1, cgi2, cgi3]
    towers = {
        cgi1: (21.1500, 72.8100),
        cgi2: (21.1600, 72.8100),
        cgi3: (21.1550, 72.8200),
    }
    tower_csv = "cgi,operator,frequency_band,latitude,longitude,azimuth,beamwidth,range_meters,site_address\n"
    for cgi, (lat, lon) in towers.items():
        tower_csv += f"{cgi},Airtel,LTE1800,{lat},{lon},0,60,1200,BRK Site {cgi}\n"

    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "LOC Admin"},
                     [(f"tower_dump_{suffix}.csv", tower_csv, "text/csv")],
                     token=token)
    tower_upload_id = r["results"][0].get("upload_id") if isinstance(r.get("results"), list) and r["results"] else None
    if tower_upload_id:
        created["uploads"].append(tower_upload_id)
    st, _ = poll_status(tower_upload_id, token)
    check("tower dump completed", st, "completed")

    # CDR: 3+ events per tower so the frame builder can merge ≥3 towers
    cdr_csv = "calling_no,called_no,datetime,type,duration,first cgi,first cgi lat/long,mcc,mnc,lac,cell_id,ta,rtt,signal_strength\n"
    rows = []
    base_hour = 8
    for i in range(3):
        for cgi, (lat, lon) in towers.items():
            ta = 10 + i
            rtt = 2 * (ta * 78.125) / 1000.0
            rows.append(
                f"919876543210,919812345670,2026-08-02 08:0{i}:00,MOC,120,{cgi},{lat}/{lon},404,20,100,{i},{ta},{rtt:.2f},-7{5 + i}"
            )
    cdr_csv += "\n".join(rows) + "\n"

    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "LOC Admin"},
                     [(f"cdr_{suffix}.csv", cdr_csv, "text/csv")],
                     token=token)
    cdr_upload_id = r["results"][0].get("upload_id") if isinstance(r.get("results"), list) and r["results"] else None
    if cdr_upload_id:
        created["uploads"].append(cdr_upload_id)
    st, _ = poll_status(cdr_upload_id, token)
    check("cdr completed", st, "completed")

    # ── tower lookup ─────────────────────────────────────────
    s, r = call("GET", f"/api/towers?cgi={cgi1}", token=token)
    check("tower lookup 200", s, 200)
    check("tower lookup cgi", r.get("cgi"), cgi1)

    s, r = call("GET", "/api/towers?cgi=404-99-999-999", token=token)
    check("tower lookup unknown 404", s, 404)

    # ── run localization ─────────────────────────────────────
    s, r = call("POST", f"/api/case/{cnum}/localize", token=token)
    check("localize 200", s, 200)
    fix_count = r.get("fix_count", 0)
    check("localize produced fixes", fix_count > 0, True)
    geojson = r.get("geojson", {})
    # each fix yields a Point + confidence-ellipse Polygon
    check("localize geojson features", len(geojson.get("features", [])), fix_count * 2)
    check("geojson valid Point", geojson.get("features", [{}])[0].get("geometry", {}).get("type"), "Point")

    # ── cached geojson ───────────────────────────────────────
    s, r = call("GET", f"/api/case/{cnum}/localize/geojson", token=token)
    check("cached geojson 200", s, 200)
    check("cached geojson features", len(r.get("features", [])), fix_count * 2)

    # geojson with invalid start date
    s, r = call("GET", f"/api/case/{cnum}/localize/geojson?start=notadate", token=token)
    check("geojson bad start 400", s, 400)

    # ── heatmap ──────────────────────────────────────────────
    s, r = call("GET", f"/api/case/{cnum}/heatmap", token=token)
    check("heatmap 200", s, 200)
    check("heatmap has points", len(r.get("features", [])) >= 1, True)

    # heatmap with invalid start
    s, r = call("GET", f"/api/case/{cnum}/heatmap?start=notadate", token=token)
    check("heatmap bad start 400", s, 400)

    # ── rtt-observations ─────────────────────────────────────
    s, r = call("GET", f"/api/case/{cnum}/rtt-observations", token=token)
    check("rtt-observations 200", s, 200)
    check("rtt has observations", len(r.get("observations", [])) >= 1, True)

    # ── report ───────────────────────────────────────────────
    s, r = call("GET", f"/api/case/{cnum}/report", token=token)
    check("report 200", s, 200)
    check("report status COMPLETED", r.get("status"), "COMPLETED")
    check("report fix_count", r.get("summary", {}).get("fix_count"), fix_count)
    check("report has subscriber", len(r.get("subscribers", [])) >= 1, True)

    # ── exports ──────────────────────────────────────────────
    s, csv_content = raw_get(f"/api/case/{cnum}/export/csv", token=token)
    check("csv export 200", s, 200)
    check("csv has data", len(csv_content) > 0, True)

    s, kml_content = raw_get(f"/api/case/{cnum}/export/kml", token=token)
    check("kml export 200", s, 200)
    check("kml has Placemark", "Placemark" in kml_content, True)

    s, pdf_content = raw_get(f"/api/case/{cnum}/export/pdf", token=token)
    check("pdf export 200", s, 200)
    check("pdf has data", len(pdf_content) > 0, True)

    # export on nonexistent case
    s, _ = raw_get("/api/case/BRK-NOPE-000/export/csv", token=token)
    check("csv export nonexistent 404", s, 404)

    # ── localize with upload_ids filter ──────────────────────
    s, r = call("POST", f"/api/case/{cnum}/localize?upload_ids={cdr_upload_id}", token=token)
    check("localize filtered by upload 200", s, 200)

    # ── localize nonexistent case ────────────────────────────
    s, r = call("POST", "/api/case/BRK-NOPE-000/localize", token=token)
    check("localize nonexistent 404", s, 404)

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


def test_localization_live():
    assert main() == 0