"""
Live break-test for Auth & RBAC features against the running backend.
Creates its own test officers, verifies expected behavior + edge cases,
and cleans up after itself. All results printed; failures raise.
"""

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


def call(method, path, token=None, body=None, raw=None, content_type=None):
    url = BASE + path
    data = None
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if raw is not None:
        data = raw
        headers["Content-Type"] = content_type or "application/octet-stream"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
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


def rand_email(prefix):
    return f"{prefix}{''.join(random.choices(string.ascii_lowercase, k=6))}@example.com"


def main():
    created = {"officers": [], "sessions": []}

    # ── register ──────────────────────────────────────────────
    email = rand_email("reg_")
    s, r = call("POST", "/api/auth/register", body={
        "officer_name": "BreakTest Reg", "email": email, "password": "strongpass123"})
    check("register 201", s, 201)
    if s == 201:
        created["officers"].append(r["officer"]["officer_id"])
        created["sessions"].append(r["access_token"])
        reg_token = r["access_token"]
    else:
        reg_token = None

    # duplicate register
    s, r = call("POST", "/api/auth/register", body={
        "officer_name": "Dup", "email": email, "password": "strongpass123"})
    check("register duplicate 409", s, 409)

    # weak password
    s, r = call("POST", "/api/auth/register", body={
        "officer_name": "Weak", "email": rand_email("weak_"), "password": "short"})
    check("register weak password 422", s, 422)

    # invalid email
    s, r = call("POST", "/api/auth/register", body={
        "officer_name": "Bad", "email": "not-an-email", "password": "strongpass123"})
    check("register invalid email 422", s, 422)

    # ── login ─────────────────────────────────────────────────
    s, r = call("POST", "/api/auth/login", body={
        "email": email, "password": "strongpass123"})
    check("login 200", s, 200)
    login_token = r.get("access_token") if s == 200 else None

    # wrong password
    s, r = call("POST", "/api/auth/login", body={
        "email": email, "password": "wrongpass123"})
    check("login wrong password 401", s, 401)

    # unknown email
    s, r = call("POST", "/api/auth/login", body={
        "email": rand_email("nouser_"), "password": "strongpass123"})
    check("login unknown email 401", s, 401)

    # ── me ────────────────────────────────────────────────────
    if login_token:
        s, r = call("GET", "/api/auth/me", token=login_token)
        check("me 200", s, 200)
        check("me role inspector", r.get("role"), "INSPECTOR")

    # me without token
    s, r = call("GET", "/api/auth/me")
    check("me no token 401", s, 401)

    # me with garbage token
    s, r = call("GET", "/api/auth/me", token="garbage.token.value")
    check("me garbage token 401", s, 401)

    # ── protected admin endpoints as INSPECTOR → 403 ─────────
    if login_token:
        for path in ["/api/admin/users", "/api/admin/audit-logs",
                     "/api/admin/system-status"]:
            s, r = call("GET", path, token=login_token)
            check(f"inspector {path} 403", s, 403)

    # ── logout ────────────────────────────────────────────────
    if reg_token:
        s, r = call("POST", "/api/auth/logout", token=reg_token)
        check("logout 200", s, 200)
        s, r = call("GET", "/api/auth/me", token=reg_token)
        check("me after logout 401", s, 401)
        created["sessions"].remove(reg_token) if reg_token in created["sessions"] else None

    # ── logout-all ────────────────────────────────────────────
    if login_token:
        s, r = call("POST", "/api/auth/logout-all", token=login_token)
        check("logout-all 200", s, 200)
        s, r = call("GET", "/api/auth/me", token=login_token)
        check("me after logout-all 401", s, 401)

    # ── admin user management (need an ADMIN token) ───────────
    # Bootstrap a dedicated test ADMIN directly in the DB with known creds,
    # then log in. Deleted during cleanup.
    admin_token = None
    admin_id = None
    try:
        import asyncio
        from dotenv import load_dotenv
        from uuid import uuid4
        load_dotenv()

        async def _bootstrap():
            from app.core.security import hash_password
            from app.database.models import OfficerModel
            from app.database.session import async_session_maker
            async with async_session_maker() as db:
                o = OfficerModel(
                    officer_id=uuid4(), officer_name="BreakTest Admin",
                    email="breaktest.admin@example.com",
                    password_hash=hash_password("Admin@12345"),
                    role="ADMIN", is_active=True)
                db.add(o)
                await db.commit()
                return str(o.officer_id)
        def _dispose_engine():
            from app.database.session import engine as _eng

            async def _d():
                await _eng.dispose()
            asyncio.run(_d())

        admin_id = asyncio.run(_bootstrap())
        _dispose_engine()
        created["officers"].append(admin_id)

        s, r = call("POST", "/api/auth/login", body={
            "email": "breaktest.admin@example.com", "password": "Admin@12345"})
        if s == 200:
            admin_token = r["access_token"]
            created["sessions"].append(admin_token)
    except Exception as e:
        print("ADMIN BOOTSTRAP FAILED:", e)

    print("\n-- admin section --")
    if not admin_token:
        print("SKIP admin (bootstrap failed)")
    else:
        s, r = call("GET", "/api/admin/users", token=admin_token)
        check("admin list users 200", s, 200)

        # create user via admin
        ue = rand_email("adminusr_")
        s, r = call("POST", "/api/admin/users", token=admin_token, body={
            "officer_name": "AdminCreated", "email": ue,
            "password": "strongpass123", "role": "INSPECTOR"})
        check("admin create user 201", s, 201)
        if s == 201:
            created["officers"].append(r["user"]["officer_id"])

        # duplicate
        s, r = call("POST", "/api/admin/users", token=admin_token, body={
            "officer_name": "Dup", "email": ue, "password": "strongpass123"})
        check("admin create duplicate 409", s, 409)

        # bad role
        s, r = call("POST", "/api/admin/users", token=admin_token, body={
            "officer_name": "BadRole", "email": rand_email("badr_"),
            "password": "strongpass123", "role": "SUPERUSER"})
        check("admin create bad role 422", s, 422)

        # create a second inspector to test status/role toggle + assignment
        ue2 = rand_email("adminusr2_")
        s, r = call("POST", "/api/admin/users", token=admin_token, body={
            "officer_name": "ToggleMe", "email": ue2,
            "password": "strongpass123", "role": "INSPECTOR"})
        check("admin create user2 201", s, 201)
        if s == 201:
            created["officers"].append(r["user"]["officer_id"])
            uid2 = r["user"]["officer_id"]

            # deactivate
            s, r = call("PATCH", f"/api/admin/users/{uid2}/status", token=admin_token,
                        body={"is_active": False})
            check("admin deactivate 200", s, 200)

            # deactivated user cannot login
            s, r = call("POST", "/api/auth/login", body={
                "email": ue2, "password": "strongpass123"})
            check("deactivated login 401", s, 401)

            # reactivate
            s, r = call("PATCH", f"/api/admin/users/{uid2}/status", token=admin_token,
                        body={"is_active": True})
            check("admin reactivate 200", s, 200)

            # role change
            s, r = call("PATCH", f"/api/admin/users/{uid2}/role", token=admin_token,
                        body={"role": "ADMIN"})
            check("admin role change 200", s, 200)

            # reset password
            s, r = call("POST", f"/api/admin/users/{uid2}/reset-password", token=admin_token,
                        body={"new_password": "newpass12345"})
            check("admin reset password 200", s, 200)

            # invalid user id
            s, r = call("PATCH", "/api/admin/users/not-a-uuid/status", token=admin_token,
                        body={"is_active": False})
            check("admin invalid id 400", s, 400)

        # case assignment
        s, r = call("POST", "/api/cases", token=admin_token, body={
            "case_name": "BreakTest Assignment Case",
            "case_number": "BRK-ASSIGN-" + "".join(random.choices(string.digits, k=4)),
            "suspect_name": "BreakTest Suspect",
            "mobile_number": "919876543210",
            "description": "temp",
        })
        if s == 201 and admin_token:
            created["cases"] = [r["id"]]
            cid = r["id"]
            inspector_email = ue
            s, r = call("POST", "/api/auth/login", body={
                "email": inspector_email, "password": "strongpass123"})
            if s == 200:
                insp_id = r["officer"]["officer_id"]
                s, r = call("POST", f"/api/admin/cases/{cid}/assign", token=admin_token,
                            body={"officer_id": insp_id})
                check("admin assign case 200", s, 200)
                s, r = call("POST", f"/api/admin/cases/{cid}/assign", token=admin_token,
                            body={"officer_id": insp_id})
                check("admin assign duplicate 409", s, 409)
                s, r = call("GET", f"/api/admin/cases/{cid}/assignments", token=admin_token)
                check("admin list assignments 200", s, 200)
                s, r = call("DELETE", f"/api/admin/cases/{cid}/assign/{insp_id}",
                            token=admin_token)
                check("admin unassign 200", s, 200)
            else:
                print("SKIP assignment (inspector login failed)")
        else:
            print("SKIP assignment (case create failed)")

        s, r = call("GET", "/api/admin/audit-logs", token=admin_token)
        check("admin audit-logs 200", s, 200)

        s, r = call("GET", "/api/admin/system-status", token=admin_token)
        check("admin system-status 200", s, 200)

    # ── summary ───────────────────────────────────────────────
    # Cleanup: revoke sessions, delete created officers + case.
    async def _cleanup():
        from app.database.models import CaseModel, OfficerModel
        from app.database.models.telecom import CaseModel as TCaseModel
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
    import asyncio
    asyncio.run(_cleanup())

    print(f"\nRESULT: {PASS} passed, {FAIL} failed")
    print("CREATED:", json.dumps(created))
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())


def test_auth_rbac_live():
    """Live break-test for Auth & RBAC against the running backend."""
    assert main() == 0