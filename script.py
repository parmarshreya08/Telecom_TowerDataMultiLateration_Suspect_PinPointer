import asyncio
from sqlalchemy import create_engine, text

def main():
    db_url = "postgresql+psycopg2://neondb_owner:npg_QH3eUsn4OKbv@ep-holy-mountain-azt2bf2q.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    engine = create_engine(db_url)
    
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT f.frame_id, COUNT(t.tower_id) as tower_count
            FROM measurement_frames f
            JOIN upload_metadata u ON u.upload_id = f.upload_id
            LEFT JOIN measurement_towers t ON t.frame_id = f.frame_id
            WHERE u.case_id = 'CASE-VERIFY-2DF50F54'
            GROUP BY f.frame_id
            ORDER BY tower_count DESC
        """))
        
        frames = result.fetchall()
        for f in frames:
            print(f"Frame {f.frame_id} -> {f.tower_count} towers")

if __name__ == "__main__":
    main()
