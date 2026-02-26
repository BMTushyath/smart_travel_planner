from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), index=True, unique=True)
    password_hash = db.Column(db.String(128))
    vehicles = db.relationship('Vehicle', backref='owner', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Vehicle(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64))
    mileage = db.Column(db.Float)  # km/l or km/kWh
    vehicle_type = db.Column(db.String(20))  # 'fuel' or 'ev'
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))

class Trip(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    start_location = db.Column(db.String(128))
    end_location = db.Column(db.String(128))
    distance_km = db.Column(db.Float)
    fuel_cost = db.Column(db.Float)
    timestamp = db.Column(db.DateTime, index=True, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
