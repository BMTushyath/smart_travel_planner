import requests

BASE_URL = "http://127.0.0.1:5000"
SESSION = requests.Session()

def test_signup():
    print("Testing Signup...")
    res = SESSION.post(f"{BASE_URL}/login", json={
        "username": "testuser",
        "password": "testpassword",
        "action": "signup"
    })
    print(f"Status: {res.status_code}, Response: {res.json()}")

def test_login():
    print("Testing Login...")
    res = SESSION.post(f"{BASE_URL}/login", json={
        "username": "testuser",
        "password": "testpassword",
        "action": "login"
    })
    print(f"Status: {res.status_code}, Response: {res.json()}")

def test_add_vehicle():
    print("Testing Add Vehicle...")
    res = SESSION.post(f"{BASE_URL}/api/vehicle", json={
        "name": "Test Car",
        "mileage": 15.0,
        "type": "fuel"
    })
    print(f"Status: {res.status_code}, Response: {res.json()}")

def test_get_vehicles():
    print("Testing Get Vehicles...")
    res = SESSION.get(f"{BASE_URL}/api/vehicle")
    print(f"Status: {res.status_code}, Response: {res.json()}")
    return res.json()

def test_calculate_trip(vehicle_id):
    print("Testing Calculate Trip...")
    res = SESSION.post(f"{BASE_URL}/api/calculate_trip", json={
        "start": "Delhi",
        "end": "Mumbai",
        "distance_km": 100,
        "vehicle_id": vehicle_id
    })
    print(f"Status: {res.status_code}, Response: {res.json()}")

def test_smart_plan():
    print("Testing Smart Plan...")
    res = SESSION.post(f"{BASE_URL}/api/smart_plan", json={
        "start_hour": 8,
        "end_hour": 12
    })
    print(f"Status: {res.status_code}, Response: {res.json()}")

if __name__ == "__main__":
    try:
        test_signup()
        test_login()
        vehicles = test_get_vehicles()
        if vehicles:
            test_calculate_trip(vehicles[0]['id'])
        else:
            test_add_vehicle()
            vehicles = test_get_vehicles()
            test_calculate_trip(vehicles[0]['id'])
        
        test_smart_plan()
    except Exception as e:
        print(f"Error: {e}")
