import urllib.request
import json

url = "http://localhost:8000/api/cases"
req = urllib.request.urlopen(url)
data = json.loads(req.read().decode("utf-8"))

print(f"TOTAL RETURNED: {data.get('total')}")
print(f"ITEMS COUNT: {len(data.get('items', []))}")
print("=" * 80)

for i, item in enumerate(data.get("items", []), 1):
    c_name = item.get("case_name")
    c_id = item.get("id")
    status = item.get("status")
    tracking = item.get("tracking_status")
    fixes = item.get("fix_count")
    print(f"[{i:02d}] ID: {c_id:<22} | Name: {c_name:<38} | Status: {repr(status):<12} | Tracking: {repr(tracking):<15} | Fixes: {fixes}")
