from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_api_and_database():
    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
