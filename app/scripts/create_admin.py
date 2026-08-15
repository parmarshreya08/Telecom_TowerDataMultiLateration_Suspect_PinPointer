"""
CLI script to create or promote an Administrator account in E-Rakshak.

Usage:
    python -m app.scripts.create_admin --email admin@erakshak.gov.in --name "Chief Admin" --password "SecureAdminPass123!"
    python -m app.scripts.create_admin (interactive mode)
"""

import argparse
import asyncio
import getpass
import sys
from uuid import uuid4

from sqlalchemy import select

from app.core.security import hash_password
from app.database.models import OfficerModel
from app.database.session import AsyncSessionLocal
from app.utils.datetime_utils import now_ist


async def create_or_promote_admin(email: str, name: str, password: str) -> None:
    email_clean = email.strip().lower()
    name_clean = name.strip()

    if not email_clean or "@" not in email_clean:
        print("Error: A valid email address is required.", file=sys.stderr)
        sys.exit(1)

    if len(password) < 8:
        print("Error: Password must be at least 8 characters long.", file=sys.stderr)
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        stmt = select(OfficerModel).where(OfficerModel.email == email_clean)
        res = await db.execute(stmt)
        officer = res.scalar_one_or_none()

        pw_hash = hash_password(password)

        if officer:
            officer.officer_name = name_clean or officer.officer_name
            officer.password_hash = pw_hash
            officer.role = "ADMIN"
            officer.is_active = True
            officer.updated_at = now_ist()
            await db.commit()
            print(f"[SUCCESS] Existing officer '{officer.email}' was promoted to ADMIN with updated password.")
        else:
            new_admin = OfficerModel(
                officer_id=uuid4(),
                officer_name=name_clean or "System Administrator",
                email=email_clean,
                password_hash=pw_hash,
                role="ADMIN",
                is_active=True,
                created_at=now_ist(),
                updated_at=now_ist(),
            )
            db.add(new_admin)
            await db.commit()
            print(f"[SUCCESS] New ADMIN account created successfully:")
            print(f"  - Officer ID: {new_admin.officer_id}")
            print(f"  - Name:       {new_admin.officer_name}")
            print(f"  - Email:      {new_admin.email}")
            print(f"  - Role:       {new_admin.role}")


def main():
    parser = argparse.ArgumentParser(description="Create or promote an initial Administrator account for E-Rakshak.")
    parser.add_argument("--email", "-e", type=str, help="Admin email address")
    parser.add_argument("--name", "-n", type=str, default="System Administrator", help="Admin display name")
    parser.add_argument("--password", "-p", type=str, help="Admin password (will prompt if omitted)")

    args = parser.parse_args()

    email = args.email
    name = args.name
    password = args.password

    if not email:
        email = input("Enter Admin Email: ").strip()

    if not name:
        name = input("Enter Admin Name [System Administrator]: ").strip() or "System Administrator"

    if not password:
        password = getpass.getpass("Enter Admin Password (min 8 chars): ")
        password_confirm = getpass.getpass("Confirm Admin Password: ")
        if password != password_confirm:
            print("Error: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    asyncio.run(create_or_promote_admin(email, name, password))


if __name__ == "__main__":
    main()
