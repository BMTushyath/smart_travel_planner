import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, redirect, url_for

# Load environment variables from .env file
load_dotenv()

# Retrieve variables
api_key = os.getenv('API_KEY')
secret_key = os.getenv('SECRET_KEY')

# Print confirmation (safely)
if api_key and secret_key:
    print("Environment variables 'API_KEY' and 'SECRET_KEY' loaded successfully.")
else:
    missing = []
    if not api_key: missing.append('API_KEY')
    if not secret_key: missing.append('SECRET_KEY')
    print(f"Warning: Missing environment variables: {', '.join(missing)}")

from config import Config
from models import db, User, Vehicle, Trip
from services import FuelService, TomTomTrafficService, WeatherService

app = Flask(__name__, template_folder='../frontend/templates', static_folder='../frontend/static')
app.config.from_object(Config)
db.init_app(app)

# Initialize Services
fuel_service = FuelService(app.config.get('FUEL_API_KEY'))
# ml_service = MLService() # Deprecated

tomtom_service = TomTomTrafficService(app.config.get('TOMTOM_API_KEY'))
weather_service = WeatherService()

with app.app_context():
    db.create_all()



@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json
        username = data.get('username')
        password = data.get('password')
        action = data.get('action') # 'login' or 'signup'

        if action == 'signup':
            if User.query.filter_by(username=username).first():
                return jsonify({'error': 'Username already exists'}), 400
            user = User(username=username)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            session['user_id'] = user.id
            return jsonify({'message': 'Signup successful', 'redirect': url_for('dashboard')})
        
        else: # login
            user = User.query.filter_by(username=username).first()
            if user and user.check_password(password):
                session['user_id'] = user.id
                return jsonify({'message': 'Login successful', 'redirect': url_for('dashboard')})
            return jsonify({'error': 'Invalid credentials'}), 401

    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('dashboard.html')

@app.route('/api/vehicle', methods=['GET', 'POST'])
def vehicle_handler():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if request.method == 'POST':
        data = request.json
        vehicle = Vehicle(
            name=data['name'],
            mileage=float(data['mileage']),
            vehicle_type=data['type'],
            fuel_type=data.get('fuel_type', 'petrol'),
            user_id=session['user_id']
        )
        db.session.add(vehicle)
        db.session.commit()
        return jsonify({'message': 'Vehicle added'})
    
    elif request.method == 'GET':
        vehicles = Vehicle.query.filter_by(user_id=session['user_id']).all()
        vehicle_list = [{
            'id': v.id,
            'name': v.name,
            'mileage': v.mileage,
            'type': v.vehicle_type,
            'fuel_type': v.fuel_type
        } for v in vehicles]
        return jsonify(vehicle_list)

@app.route('/api/vehicle/<int:vehicle_id>', methods=['DELETE'])
def delete_vehicle(vehicle_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle or vehicle.user_id != session['user_id']:
        return jsonify({'error': 'Vehicle not found'}), 404
    
    db.session.delete(vehicle)
    db.session.commit()
    return jsonify({'message': 'Vehicle deleted'})

@app.route('/api/calculate_trip', methods=['POST'])
def calculate_trip():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.json
    distance_km = float(data.get('distance_km', 0))
    vehicle_id = data.get('vehicle_id')
    
    if not vehicle_id:
        return jsonify({'error': 'Please select a vehicle'}), 400
    
    if distance_km <= 0:
         return jsonify({'error': 'Invalid distance'}), 400

    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle or vehicle.user_id != session['user_id']:
        return jsonify({'error': 'Invalid vehicle'}), 400

    # Get fuel prices
    # For now, we use a default city or could pass it from frontend
    prices = fuel_service.get_fuel_prices()
    
    price_per_unit = prices.get(vehicle.fuel_type, prices['petrol'])
    
    # Calculate cost: (Distance / Mileage) * Price
    fuel_needed = distance_km / vehicle.mileage
    cost = fuel_needed * price_per_unit
    
    result = {
        "cost": round(cost, 2),
        "fuel_needed": round(fuel_needed, 2),
        "price_per_unit": price_per_unit,
        "vehicle": vehicle.name
    }
            
    return jsonify(result)

@app.route('/api/smart_plan', methods=['POST'])
def smart_plan():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    start_hour = int(data['start_hour'])
    end_hour = int(data['end_hour'])
    origin = data.get('origin')
    destination = data.get('destination')
    target_date = data.get('date')
    
    if not origin or not destination:
         return jsonify({'error': 'Missing origin or destination for prediction'}), 400

    # Fetch vehicle mileage if vehicle_id is provided
    vehicle_id = data.get('vehicle_id')
    mileage = 15.0 # Default fallback
    if vehicle_id:
        vehicle = Vehicle.query.get(vehicle_id)
        if vehicle:
            mileage = vehicle.mileage

    best_hour, avg_speed, traffic_level = tomtom_service.find_best_departure_time(origin, destination, start_hour, end_hour, target_date=target_date)
    
    if best_hour is None:
        return jsonify({'message': 'Could not calculate best time.'}), 400

    # Get route details for the current traffic (at the start_hour)
    selected_date = None
    if target_date:
        try:
            selected_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        except:
            selected_date = None

    now = datetime.now()
    if selected_date:
        check_time = datetime.combine(selected_date, datetime.min.time()).replace(hour=start_hour)
    else:
        check_time = now.replace(hour=start_hour, minute=0, second=0, microsecond=0)
        if check_time < now:
            check_time += timedelta(days=1)
            
    depart_at = check_time.strftime("%Y-%m-%dT%H:%M:%S")
    
    # Request alternatives to skip traffic
    route_data = tomtom_service.get_route(origin, destination, depart_at=depart_at, find_alt=True, mileage=mileage)
    
    if "error" in route_data:
        return jsonify(route_data), 400

    primary = route_data.get("primary")
    alternative = route_data.get("alternative")
    
    # Convert best_hour to 12-hour format
    period = "AM" if best_hour < 12 else "PM"
    hour_12 = best_hour % 12
    if hour_12 == 0:
        hour_12 = 12
    time_str = f"{hour_12}:00 {period}"

    return jsonify({
        "best_hour": best_hour,
        "avg_speed": avg_speed,
        "traffic_level": primary.get("traffic_level", "Low"),
        "reason": primary.get("reason", "No specific issues detected."),
        "via_point": primary.get("via_point", "N/A"),
        "best_alt_time": time_str,
        "best_alt_speed": avg_speed,
        "primary": primary,
        "alternative": alternative,
        "date_insights": route_data.get("date_insights"),
        "message": f"Based on real traffic data, the best time to leave is around {time_str}. Estimated average speed: {avg_speed} km/h."
    })

@app.route('/api/route', methods=['POST'])
def route():
    data = request.json
    origin = data.get('origin')
    destination = data.get('destination')
    
    if not origin or not destination:
        return jsonify({'error': 'Missing origin or destination'}), 400
        
    result = tomtom_service.get_route(origin, destination)
    if "error" in result:
        return jsonify(result), 400
        
    # Return primary route for the regular routing check
    return jsonify(result.get("primary"))

@app.route('/api/traffic', methods=['POST'])
def traffic():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    origin = data.get('origin')
    destination = data.get('destination')
    if not origin or not destination:
        return jsonify({'error': 'Missing origin or destination'}), 400
    result = tomtom_service.get_traffic(origin, destination)
    return jsonify(result)

@app.route('/api/weather', methods=['POST'])
def weather():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    origin = data.get('origin')
    destination = data.get('destination')
    start_hour = int(data.get('start_hour', 8))
    end_hour = int(data.get('end_hour', 18))
    target_date = data.get('date')  # Optional: YYYY-MM-DD

    if not destination:
        return jsonify({'error': 'Missing destination'}), 400

    # Geocode destination to get lat/lon
    coords = tomtom_service._geocode(destination)
    if not coords:
        return jsonify({'error': f'Could not find location: {destination}'}), 400

    result = weather_service.get_forecast(coords['lat'], coords['lon'], start_hour, end_hour, target_date=target_date)
    if 'error' in result:
        return jsonify(result), 400

    return jsonify(result)

@app.route('/api/laps', methods=['POST'])
def laps():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    origin = data.get('origin')
    destination = data.get('destination')
    start_hour = int(data.get('start_hour', 8))
    end_hour = int(data.get('end_hour', 18))
    target_date = data.get('date')

    if not origin or not destination:
        return jsonify({'error': 'Missing origin or destination'}), 400

    # Fetch vehicle mileage if vehicle_id is provided
    vehicle_id = data.get('vehicle_id')
    mileage = 15.0 # Default fallback
    if vehicle_id:
        vehicle = Vehicle.query.get(vehicle_id)
        if vehicle:
            mileage = vehicle.mileage

    result = tomtom_service.calculate_laps(origin, destination, start_hour, end_hour, target_date=target_date, mileage=mileage)
    if isinstance(result, dict) and 'error' in result:
        return jsonify(result), 400
    
    return jsonify(result)

@app.route('/api/monitor', methods=['GET'])
def monitor():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(tomtom_service.get_monitor_data())

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True)
