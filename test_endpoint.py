import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.core.deps import get_current_officer

def mock_get_current_officer():
    # Return a dummy user object or dict that satisfies the endpoint
    class MockOfficer:
        officer_id = "00000000-0000-0000-0000-000000000000"
    return MockOfficer()

# Override the dependency
app.dependency_overrides[get_current_officer] = mock_get_current_officer

def test_endpoint():
    client = TestClient(app)
    
    response = client.post(
        "/api/case/CASE-VERIFY-2DF50F54/localize?geocode=true"
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")

if __name__ == "__main__":
    test_endpoint()
