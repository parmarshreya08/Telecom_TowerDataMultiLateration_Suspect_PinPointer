"""
Live break-test for Uploads / Files (multipart upload, from-URL with SSRF guard,
list/status/rename/delete/batch-delete/reinit) against the running backend.
Bootstraps a test ADMIN + INSPECTOR + case, exercises edge cases, then cleans up.
"""

import asyncio
import json
import random
import string
import sys
import urllib.request
import uuid as _uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

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


def rnd_case_number():
    return "BRK-UPL-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


CDR_CSV = "timestamp,phone_number,cgi,event_type\n2026-08-01T10:00:00,919876543210,510-00-01-001234-01,attach\n"


def main():
    created = {"officers": [], "cases": [], "uploads": [], "sessions": []}

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
                await db.execute(text("DELETE FROM officers WHERE email LIKE 'upl.%@example.com'"))
                admin = OfficerModel(
                    officer_id=uuid4(), officer_name="UPL Admin",
                    email="upl.admin@example.com",
                    password_hash=hash_password("Admin@12345"),
                    role="ADMIN", is_active=True)
                insp = OfficerModel(
                    officer_id=uuid4(), officer_name="UPL Insp",
                    email="upl.inspector@example.com",
                    password_hash=hash_password("Insp@12345"),
                    role="INSPECTOR", is_active=True)
                db.add_all([admin, insp])
                await db.commit()
                return str(admin.officer_id), str(insp.officer_id)
        admin_id, insp_id = asyncio.run(_bootstrap())
        from app.database.session import engine as _eng
        async def _dispose():
            await _eng.dispose()
        asyncio.run(_dispose())
        created["officers"] = [admin_id, insp_id]
    except Exception as e:
        print("BOOTSTRAP FAILED:", e)
        return 1

    s, r = call("POST", "/api/auth/login", body={"email": "upl.admin@example.com", "password": "Admin@12345"})
    admin_token = r.get("access_token") if s == 200 else None
    created["sessions"].append(admin_token) if admin_token else None
    s, r = call("POST", "/api/auth/login", body={"email": "upl.inspector@example.com", "password": "Insp@12345"})
    insp_token = r.get("access_token") if s == 200 else None
    created["sessions"].append(insp_token) if insp_token else None

    if not admin_token or not insp_token:
        print("LOGIN FAILED")
        return 1

    cnum = rnd_case_number()
    s, r = call("POST", "/api/cases", body={
        "case_name": "UPL Case", "case_number": cnum}, token=admin_token)
    if s != 201:
        print("CASE CREATE FAILED")
        return 1
    created["cases"].append(cnum)

    # ── multipart upload (valid CSV) ─────────────────────────
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "UPL Admin"},
                     [("cdr_break_test.csv", CDR_CSV, "text/csv")],
                     token=admin_token)
    check("multipart upload 201", s, 201)
    upl = None
    if isinstance(r.get("results"), list) and r["results"]:
        upl = r["results"][0]
    if upl and upl.get("upload_id"):
        created["uploads"].append(upl["upload_id"])

    # invalid extension → per-file rejected in results (HTTP 201)
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "UPL Admin"},
                     [("evil.exe", "MZ...", "application/octet-stream")],
                     token=admin_token)
    check("upload bad extension 201", s, 201)
    check("bad extension rejected", r.get("rejected"), 1)

    # empty file → per-file rejected
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "UPL Admin"},
                     [("empty.csv", "", "text/csv")],
                     token=admin_token)
    check("upload empty file 201", s, 201)
    check("empty file rejected", r.get("rejected"), 1)

    # no auth
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "UPL Admin"},
                     [("cdr_break_test.csv", CDR_CSV, "text/csv")])
    check("upload no auth 401", s, 401)

    # upload to nonexistent case
    s, r = multipart("/api/case/BRK-NOPE-000/upload",
                     {"uploaded_by": "UPL Admin"},
                     [("cdr_break_test.csv", CDR_CSV, "text/csv")],
                     token=admin_token)
    check("upload nonexistent case 404", s, 404)

    # ── list / status ────────────────────────────────────────
    s, r = call("GET", f"/api/case/{cnum}/files", token=admin_token)
    check("list files 200", s, 200)
    check("list has 1 file", r.get("total"), 1)

    # status invalid id
    s, r = call("GET", "/api/file/not-a-uuid/status", token=admin_token)
    check("status invalid id 422", s, 422)

    # status nonexistent
    s, r = call("GET", f"/api/file/{_uuid.uuid4()}/status", token=admin_token)
    check("status nonexistent 404", s, 404)

    if created["uploads"]:
        uid = created["uploads"][0]
        s, r = call("GET", f"/api/file/{uid}/status", token=admin_token)
        check("status 200", s, 200)

        # ── rename ──────────────────────────────────────────
        s, r = call("PATCH", f"/api/file/{uid}", body={"display_name": "Renamed CDR"}, token=admin_token)
        check("rename 200", s, 200)
        check("rename name", r.get("display_name"), "Renamed CDR")

        # rename nonexistent
        s, r = call("PATCH", f"/api/file/{_uuid.uuid4()}", body={"display_name": "X"}, token=admin_token)
        check("rename nonexistent 404", s, 404)

        # ── delete ──────────────────────────────────────────
        s, r = call("DELETE", f"/api/file/{uid}", token=admin_token)
        check("delete file 200", s, 200)
        created["uploads"].remove(uid)

        s, r = call("GET", f"/api/file/{uid}/status", token=admin_token)
        check("status after delete 404", s, 404)

    # ── batch delete ────────────────────────────────────────
    # upload 2 distinct files, batch delete
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "UPL Admin"},
                     [("b1.csv", CDR_CSV + "1\n", "text/csv"), ("b2.csv", CDR_CSV + "2\n", "text/csv")],
                     token=admin_token)
    check("upload batch 2 files 201", s, 201)
    batch_ids = [x["upload_id"] for x in r.get("results", []) if x.get("upload_id")]
    check("batch 2 uploaded", len(batch_ids), 2)
    if batch_ids:
        s, r = call("POST", f"/api/case/{cnum}/files/batch-delete",
                    body={"upload_ids": batch_ids}, token=admin_token)
        check("batch delete 200", s, 200)
        check("batch deleted count", r.get("deleted"), len(batch_ids))

    # ── reinit (delete all) ─────────────────────────────────
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "UPL Admin"},
                     [("c3.csv", CDR_CSV, "text/csv")],
                     token=admin_token)
    check("upload pre-reinit 201", s, 201)
    s, r = call("DELETE", f"/api/case/{cnum}/files", token=admin_token)
    check("reinit 200", s, 200)
    s, r = call("GET", f"/api/case/{cnum}/files", token=admin_token)
    check("list empty after reinit", r.get("total"), 0)

    # ── upload from URL + SSRF ──────────────────────────────
    # localhost URL should be blocked by SSRF guard
    s, r = call("POST", f"/api/case/{cnum}/upload/url",
                body={"url": "http://127.0.0.1:8000/health", "filename": "evil.csv"}, token=admin_token)
    check("url upload localhost blocked 400", s, 400)

    # bad scheme
    s, r = call("POST", f"/api/case/{cnum}/upload/url",
                body={"url": "file:///etc/passwd", "filename": "p.csv"}, token=admin_token)
    check("url upload file scheme 400", s, 400)

    # invalid url
    s, r = call("POST", f"/api/case/{cnum}/upload/url",
                body={"url": "not a url", "filename": "p.csv"}, token=admin_token)
    check("url upload invalid url 400", s, 400)

    # inspector upload to admin case (not assigned) → 403
    s, r = multipart(f"/api/case/{cnum}/upload",
                     {"uploaded_by": "UPL Insp"},
                     [("cdr_break_test.csv", CDR_CSV, "text/csv")],
                     token=insp_token)
    check("inspector upload unassigned 403", s, 403)

    # ── cleanup ─────────────────────────────────────────────
    async def _cleanup():
        from app.database.session import async_session_maker
        from sqlalchemy import text
        async with async_session_maker() as db:
            for cid in created.get("cases", []):
                await db.execute(text('DELETE FROM upload_metadata WHERE case_id = :c'), {"c": cid})
                await db.execute(text('DELETE FROM case_assignments WHERE case_id = :c'), {"c": cid})
                await db.execute(text('DELETE FROM localization_fixes WHERE case_id = :c'), {"c": cid})
                await db.execute(text('DELETE FROM cases WHERE case_id = :c'), {"c": cid})
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


def test_uploads_live():
    assert main() == 0