"""
Live break-test for Case management (create/list/detail/update/status/delete)
against the running backend. Bootstraps a test ADMIN + INSPECTOR, creates a case,
exercises edge cases, then cleans everything up.
"""

import asyncio
import json
import random
import string
import sys
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
        with urllib.request.urlopen(req, timeout=15) as resp:
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
    return "BRK-CASE-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def main():
    created = {"officers": [], "cases": [], "sessions": []}

    # Bootstrap ADMIN + INSPECTOR directly in DB
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
                await db.execute(text("DELETE FROM officers WHERE email LIKE 'brk.%@example.com'"))
                admin = OfficerModel(
                    officer_id=uuid4(), officer_name="BRK Admin",
                    email="brk.admin@example.com",
                    password_hash=hash_password("Admin@12345"),
                    role="ADMIN", is_active=True)
                insp = OfficerModel(
                    officer_id=uuid4(), officer_name="BRK Insp",
                    email="brk.inspector@example.com",
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

    s, r = call("POST", "/api/auth/login", body={"email": "brk.admin@example.com", "password": "Admin@12345"})
    admin_token = r.get("access_token") if s == 200 else None
    created["sessions"].append(admin_token) if admin_token else None
    s, r = call("POST", "/api/auth/login", body={"email": "brk.inspector@example.com", "password": "Insp@12345"})
    insp_token = r.get("access_token") if s == 200 else None
    created["sessions"].append(insp_token) if insp_token else None

    if not admin_token or not insp_token:
        print("LOGIN FAILED")
        return 1

    # ── create ────────────────────────────────────────────────
    cnum = rnd_case_number()
    s, r = call("POST", "/api/cases", body={
        "case_name": "BRK Case Create", "case_number": cnum,
        "suspect_name": "Suspect A", "mobile_number": "919876543210",
        "description": "desc", "officer_notes": "notes"}, token=admin_token)
    check("create case 201", s, 201)
    check("create returns id", r.get("id"), cnum)
    created["cases"].append(cnum)

    # duplicate case number
    s, r = call("POST", "/api/cases", body={
        "case_name": "Dup", "case_number": cnum}, token=admin_token)
    check("create duplicate 409", s, 409)

    # invalid case_number (spaces/slashes)
    s, r = call("POST", "/api/cases", body={
        "case_name": "Bad", "case_number": "has space/bad"}, token=admin_token)
    check("create bad case_number 422", s, 422)

    # create without auth
    s, r = call("POST", "/api/cases", body={
        "case_name": "NoAuth", "case_number": rnd_case_number()})
    check("create no auth 401", s, 401)

    # ── list ──────────────────────────────────────────────────
    s, r = call("GET", "/api/cases", token=admin_token)
    check("list cases 200", s, 200)
    ids = {c.get("id") for c in r.get("items", [])}
    check("list contains created", cnum in ids, True)

    # inspector: created by admin → should NOT see admin's case
    s, r = call("GET", "/api/cases", token=insp_token)
    check("inspector list 200", s, 200)
    ids = {c.get("id") for c in r.get("items", [])}
    check("inspector cannot see admin case", cnum in ids, False)

    # ── detail ────────────────────────────────────────────────
    s, r = call("GET", f"/api/case/{cnum}", token=admin_token)
    check("case detail 200", s, 200)
    check("detail id", r.get("id"), cnum)
    check("detail status Active", r.get("status"), "Active")

    # inspector detail → 403 (not assigned, not creator)
    s, r = call("GET", f"/api/case/{cnum}", token=insp_token)
    check("inspector case detail 403", s, 403)

    # nonexistent case
    s, r = call("GET", "/api/case/BRK-NOPE-000", token=admin_token)
    check("detail nonexistent 404", s, 404)

    # ── status update ─────────────────────────────────────────
    s, r = call("PATCH", f"/api/case/{cnum}/status", body={"status": "Completed"}, token=admin_token)
    check("update status 200", s, 200)
    check("status Completed", r.get("status"), "Completed")

    # case-insensitive status
    s, r = call("PATCH", f"/api/case/{cnum}/status", body={"status": "archived"}, token=admin_token)
    check("status lowercase archived", s, 200)
    check("normalized Archived", r.get("status"), "Archived")

    # invalid status
    s, r = call("PATCH", f"/api/case/{cnum}/status", body={"status": "Bogus"}, token=admin_token)
    check("invalid status 400", s, 400)

    # update on nonexistent
    s, r = call("PATCH", "/api/case/BRK-NOPE-000/status", body={"status": "Active"}, token=admin_token)
    check("update nonexistent 404", s, 404)

    # inspector update their status on admin case → 403
    s, r = call("PATCH", f"/api/case/{cnum}/status", body={"status": "Active"}, token=insp_token)
    check("inspector update admin case 403", s, 403)

    # restore to Active
    s, r = call("PATCH", f"/api/case/{cnum}/status", body={"status": "Active"}, token=admin_token)
    check("restore Active", s, 200)

    # ── inspector sees case after assignment ─────────────────
    s, r = call("POST", f"/api/admin/cases/{cnum}/assign", body={"officer_id": insp_id}, token=admin_token)
    check("assign to inspector 200", s, 200)
    s, r = call("GET", f"/api/case/{cnum}", token=insp_token)
    check("inspector detail after assign 200", s, 200)

    # ── delete ────────────────────────────────────────────────
    # inspector cannot delete (require_admin)
    s, r = call("DELETE", f"/api/case/{cnum}", token=insp_token)
    check("inspector delete 403", s, 403)

    # admin deletes
    s, r = call("DELETE", f"/api/case/{cnum}", token=admin_token)
    check("admin delete 200", s, 200)
    created["cases"].remove(cnum)

    s, r = call("GET", f"/api/case/{cnum}", token=admin_token)
    check("detail after delete 404", s, 404)

    # delete nonexistent
    s, r = call("DELETE", "/api/case/BRK-NOPE-000", token=admin_token)
    check("delete nonexistent 404", s, 404)

    # ── dashboard stats ───────────────────────────────────────
    s, r = call("GET", "/api/dashboard/stats", token=admin_token)
    check("dashboard stats 200", s, 200)

    # ── cleanup ───────────────────────────────────────────────
    async def _cleanup():
        from app.database.session import async_session_maker
        from sqlalchemy import text
        async with async_session_maker() as db:
            for cid in created.get("cases", []):
                await db.execute(text('DELETE FROM case_assignments WHERE case_id = :c'), {"c": cid})
                await db.execute(text('DELETE FROM upload_metadata WHERE case_id = :c'), {"c": cid})
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


def test_cases_live():
    assert main() == 0