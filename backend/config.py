import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess-this-secret-key'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///app.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    FUEL_API_KEY = os.environ.get('FUEL_API_KEY') or 'PLACEHOLDER_FUEL_KEY'
    TOMTOM_API_KEY = os.environ.get('TOMTOM_API_KEY') or 'PLACEHOLDER_TOMTOM_KEY'
