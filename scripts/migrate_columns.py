"""
Migration script to ensure all required database columns exist.
"""
import asyncio
from sqlalchemy import text
from app.database.session import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as db:
        print("Ensuring database schema is synchronized...")
        
        # Add fix_method and n_towers columns to localization_fixes
        await db.execute(text("ALTER TABLE localization_fixes ADD COLUMN IF NOT EXISTS fix_method VARCHAR(50) DEFAULT 'multilateration';"))
        await db.execute(text("ALTER TABLE localization_fixes ADD COLUMN IF NOT EXISTS n_towers INTEGER DEFAULT 3;"))
        
        # Verify columns exist
        res = await db.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'localization_fixes';
        """))
        cols = [r[0] for r in res.fetchall()]
        print("localization_fixes columns:", cols)
        
        await db.commit()
        print("Database schema migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
