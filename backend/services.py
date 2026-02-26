import requests
import random
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from datetime import datetime, timedelta
import os

class FuelService:
    def __init__(self, api_key=None):
        self.api_key = api_key
        self.base_url = "https://api.fuelprice.io/v1/india" # Example URL

    def get_fuel_prices(self, city="Delhi"):
        if self.api_key and self.api_key != 'PLACEHOLDER_FUEL_KEY':
            try:
                # Using a generic endpoint for demonstration; replace with actual if known
                # For now, we'll try to use the base_url if it looks real, otherwise fallback
                response = requests.get(f"{self.base_url}/{city}", headers={"Authorization": self.api_key})
                if response.status_code == 200:
                    return response.json()
            except:
                pass
        
        # Return realistic defaults/mock data
        # Prices in INR
        return {
            "petrol": round(random.uniform(94, 102), 2),
            "diesel": round(random.uniform(85, 92), 2),
            "cng": round(random.uniform(70, 80), 2),
            "ev": round(random.uniform(8, 12), 2) # Cost per kWh
        }

class TomTomTrafficService:
    """
    Wrapper for TomTom Traffic API.
    """
    def __init__(self, api_key=None):
        # Use Config if available, otherwise fallback to env or placeholder
        try:
            from config import Config
            self.api_key = api_key or Config.TOMTOM_API_KEY
        except Exception:
            self.api_key = api_key
        self.base_url = "https://api.tomtom.com/traffic/services/4/flowSegment"

    def get_traffic(self, origin, destination):
        """Fetch traffic flow between two lat,lon points.
        Args:
            origin (str): "lat,lon"
            destination (str): "lat,lon"
        Returns:
            dict with travelTimeSec and congestionLevel or error.
        """
        url = f"{self.base_url}/{origin}/{destination}/json?key={self.api_key}"
        try:
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            flow = data.get("flowSegmentData", {})
            travel_time = flow.get("currentTravelTime", 0)
            speed = flow.get("currentSpeed", 0)
            congestion = max(0, min(100, int(100 - speed))) if isinstance(speed, (int, float)) else 0
            return {"travelTimeSec": travel_time, "congestionLevel": congestion, "raw": data}
        except Exception as e:
            return {"error": str(e)}

    def get_route(self, origin, destination, depart_at=None, find_alt=False):
        """Calculate route between two points.
        Args:
            origin (str): "City Name"
            destination (str): "City Name"
            depart_at (str): Optional "YYYY-MM-DDTHH:MM:SS"
            find_alt (bool): Whether to find alternative routes
        """
        # 1. Geocode Origin
        start_coords = self._geocode(origin)
        if not start_coords:
            return {"error": f"Could not find location: {origin}"}
            
        # 2. Geocode Destination
        end_coords = self._geocode(destination)
        if not end_coords:
            return {"error": f"Could not find location: {destination}"}
            
        # 3. Calculate Route
        locations = f"{start_coords['lat']},{start_coords['lon']}:{end_coords['lat']},{end_coords['lon']}"
        url = f"https://api.tomtom.com/routing/1/calculateRoute/{locations}/json?key={self.api_key}&traffic=true&computeTravelTimeFor=all"
        if depart_at:
            url += f"&departAt={depart_at}"
        if find_alt:
            url += "&maxAlternatives=1"
        
        try:
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            
            routes = data.get("routes", [])
            if not routes:
                return {"error": "No route found"}
            
            def process_route(route):
                summary = route.get("summary", {})
                distance_meters = summary.get("lengthInMeters", 0)
                travel_time_seconds = summary.get("travelTimeInSeconds", 0)
                no_traffic_time_seconds = summary.get("noTrafficTravelTimeInSeconds", 0)
                
                # Traffic Classification Logic
                delay_ratio = travel_time_seconds / no_traffic_time_seconds if no_traffic_time_seconds > 0 else 1
                
                if delay_ratio < 1.1:
                    traffic_level = "Low"
                    reason = "Traffic is flowing smoothly with minimal delays."
                elif delay_ratio < 1.4:
                    traffic_level = "Medium"
                    reason = "Moderate traffic detected, possibly due to regular urban flow or minor bottlenecks."
                else:
                    traffic_level = "High"
                    reason = "Heavy congestion detected. High volume of vehicles or potential road incidents in this time window."

                # Format Duration
                hours = travel_time_seconds // 3600
                minutes = (travel_time_seconds % 3600) // 60
                duration_formatted = f"{hours} hr {minutes} mins" if hours > 0 else f"{minutes} mins"
                
                # Calculate Average Speed
                distance_km = distance_meters / 1000
                travel_time_hours = travel_time_seconds / 3600
                avg_speed = round(distance_km / travel_time_hours, 1) if travel_time_hours > 0 else 0
                
                # Get a midpoint for 'via' point description
                via_point = "N/A"
                legs = route.get("legs", [])
                if legs:
                    points = legs[0].get("points", [])
                    if len(points) > 2:
                        mid_idx = len(points) // 2
                        mid_point = points[mid_idx]
                        via_info = self._reverse_geocode(mid_point['latitude'], mid_point['longitude'])
                        via_point = via_info if via_info else "Main Highway"

                return {
                    "distance_km": round(distance_km, 1),
                    "duration_formatted": duration_formatted,
                    "avg_speed_kmh": avg_speed,
                    "traffic_level": traffic_level,
                    "reason": reason,
                    "via_point": via_point,
                    "delay_ratio": round(delay_ratio, 2)
                }

            primary = process_route(routes[0])
            alternative = None
            if find_alt and len(routes) > 1:
                alternative = process_route(routes[1])

            return {
                "primary": primary,
                "alternative": alternative,
                "raw": data
            }
        except Exception as e:
            return {"error": str(e)}

    def _geocode(self, query):
        """Geocode a place name to lat,lon using TomTom Search API."""
        url = f"https://api.tomtom.com/search/2/search/{query}.json?key={self.api_key}&limit=1"
        try:
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if results:
                pos = results[0].get("position", {})
                return {"lat": pos.get("lat"), "lon": pos.get("lon")}
            return None
        except:
            return None

    def _reverse_geocode(self, lat, lon):
        """Reverse geocode coordinates to a place/street name."""
        url = f"https://api.tomtom.com/search/2/reverseGeocode/{lat},{lon}.json?key={self.api_key}"
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                addresses = data.get("addresses", [])
                if addresses:
                    addr = addresses[0].get("address", {})
                    # Prioritize more specific local areas
                    name = addr.get("municipalitySubdivision") or \
                           addr.get("neighbourhood") or \
                           addr.get("municipality") or \
                           addr.get("streetName")
                    return name
            return None
        except:
            return None

    def find_best_departure_time(self, origin, destination, start_hour, end_hour):
        """
        Find the best departure time using real TomTom Routing API traffic predictions.
        """
        start_coords = self._geocode(origin)
        end_coords = self._geocode(destination)
        
        if not start_coords or not end_coords:
            return None, 0, "Unknown"

        locations = f"{start_coords['lat']},{start_coords['lon']}:{end_coords['lat']},{end_coords['lon']}"
        
        best_hour = None
        min_travel_time = float('inf')
        best_avg_speed = 0
        current_traffic_level = "Low"
        
        now = datetime.now()
        hours_to_check = []
        if end_hour >= start_hour:
             hours_to_check = range(start_hour, end_hour + 1)
        else:
             hours_to_check = range(start_hour, 24)
        
        for hour in hours_to_check:
            check_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
            if check_time < now:
                check_time += timedelta(days=1)
                
            depart_at = check_time.strftime("%Y-%m-%dT%H:%M:%S")
            url = f"https://api.tomtom.com/routing/1/calculateRoute/{locations}/json?key={self.api_key}&traffic=true&computeTravelTimeFor=all"
            
            try:
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    routes = data.get("routes", [])
                    if routes:
                        summary = routes[0].get("summary", {})
                        travel_time = summary.get("travelTimeInSeconds", 0)
                        no_traffic_time = summary.get("noTrafficTravelTimeInSeconds", 0)
                        length = summary.get("lengthInMeters", 0)
                        
                        if travel_time < min_travel_time:
                            min_travel_time = travel_time
                            best_hour = hour
                            dist_km = length / 1000
                            time_h = travel_time / 3600
                            best_avg_speed = round(dist_km / time_h, 1) if time_h > 0 else 0
                            
                        # Capture traffic level for the first hour checked (start of window)
                        if hour == start_hour:
                            ratio = travel_time / no_traffic_time if no_traffic_time > 0 else 1
                            if ratio < 1.1: current_traffic_level = "Low"
                            elif ratio < 1.4: current_traffic_level = "Medium"
                            else: current_traffic_level = "High"
            except:
                continue
                
        return best_hour, best_avg_speed, current_traffic_level
