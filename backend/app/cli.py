import argparse
import asyncio
from getpass import getpass

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Role, User


async def create_admin(email: str, display_name: str) -> None:
    password = getpass("Password (minimum 12 characters): ")
    if len(password) < 12:
        raise SystemExit("Password must be at least 12 characters")

    async with SessionLocal() as db:
        if await db.scalar(select(User).where(User.email == email.lower())):
            raise SystemExit("A user with that email already exists")
        role = await db.scalar(select(Role).where(Role.name == "admin"))
        if not role:
            raise SystemExit("Admin role is missing; run Alembic migrations first")
        db.add(
            User(
                email=email.lower(),
                display_name=display_name,
                password_hash=hash_password(password),
                roles=[role],
            )
        )
        await db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="GAVADR backend administration")
    subparsers = parser.add_subparsers(dest="command", required=True)
    create_parser = subparsers.add_parser("create-admin")
    create_parser.add_argument("email")
    create_parser.add_argument("display_name")
    args = parser.parse_args()

    if args.command == "create-admin":
        asyncio.run(create_admin(args.email, args.display_name))


if __name__ == "__main__":
    main()
