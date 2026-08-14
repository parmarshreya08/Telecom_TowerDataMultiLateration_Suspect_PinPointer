import asyncio
from sqlalchemy import create_engine, text

def main():
    db_url = "postgresql+psycopg2://neondb_owner:npg_QH3eUsn4OKbv@ep-holy-mountain-azt2bf2q.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    engine = create_engine(db_url)
    
    with engine.connect() as conn:
        frame_id = '99ad1ebb-30cf-48db-ba84-e69e4c8c03c0'
        # Get one frame
        result = conn.execute(text("""
            SELECT f.frame_id, f.upload_id, f.timestamp, f.subscriber_identifier
            FROM measurement_frames f
            WHERE f.frame_id = :f_id
        """), {"f_id": frame_id})
        frame = result.fetchone()
        
        if not frame:
            print("No frame found")
            return
            
        print(f"FRAME:\n{frame.frame_id}\n")
        print(f"Timestamp: {frame.timestamp}")
        print(f"Subscriber: {frame.subscriber_identifier}")
        print(f"Upload ID: {frame.upload_id}\n")
        
        # Get towers for this frame
        print("TOWERS:")
        towers = conn.execute(text("""
            SELECT cgi, latitude, longitude, signal_strength, timing_advance, pseudorange_meters
            FROM measurement_towers
            WHERE frame_id = :frame_id
        """), {"frame_id": frame.frame_id}).fetchall()
        
        for i, t in enumerate(towers, 1):
            print(f"{i}. {t.cgi} -> {t.latitude}, {t.longitude} (Signal: {t.signal_strength}, TA: {t.timing_advance}, PR: {t.pseudorange_meters})")
            
        print("\nSOURCE CDR RECORDS (ALL for this upload & subscriber):")
        # Find ALL CDRs for this subscriber and upload
        cdrs = conn.execute(text("""
            SELECT timestamp, cgi, phone_number, imsi, signal_strength, timing_advance
            FROM subscriber_event_records
            WHERE upload_id = :upload_id
            AND (phone_number = :sub OR imsi = :sub)
            ORDER BY timestamp
        """), {
            "upload_id": frame.upload_id,
            "sub": frame.subscriber_identifier
        }).fetchall()
        
        for i, c in enumerate(cdrs, 1):
            print(f"{i}. {c.timestamp} -> {c.cgi} (Signal: {c.signal_strength}, TA: {c.timing_advance})")
            
if __name__ == "__main__":
    main()
