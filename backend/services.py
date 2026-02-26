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
        self.base_url = "https://api.fuelprice.io/v1/india"  # Primary API
        self._cached_prices = None

    def get_fuel_prices(self, city="Delhi"):
        # Try real API first
        if self.api_key and self.api_key != 'PLACEHOLDER_FUEL_KEY':
            try:
                response = requests.get(
                    f"{self.base_url}/{city}",
                    headers={"Authorization": self.api_key},
                    timeout=5
                )
                if response.status_code == 200:
                    data = response.json()
                    if data:
                        self._cached_prices = data
                        return data
            except:
                pass

        # Return cached prices if we had a successful call before
        if self._cached_prices:
            return self._cached_prices

        # Fallback: current average Indian fuel prices (fixed, not random)
        # These are approximate real market rates as of Feb 2026
        return {
            "petrol": 104.61,
            "diesel": 92.27,
            "cng": 76.59,
            "ev": 9.50  # Cost per kWh
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

    def find_best_departure_time(self, origin, destination, start_hour, end_hour, target_date=None):
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
        current_traffic_level = "Low" # Initialize default
        
        # Parse target_date if provided
        selected_date = None
        if target_date:
            try:
                selected_date = datetime.strptime(target_date, "%Y-%m-%d").date()
            except:
                selected_date = None

        now = datetime.now()
        hours_to_check = []
        if end_hour >= start_hour:
             hours_to_check = range(start_hour, end_hour + 1)
        else:
             hours_to_check = range(start_hour, 24)
        
        for hour in hours_to_check:
            if selected_date:
                check_time = datetime.combine(selected_date, datetime.min.time()).replace(hour=hour)
            else:
                check_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
                if check_time < now:
                    check_time += timedelta(days=1)
                
            depart_at = check_time.strftime("%Y-%m-%dT%H:%M:%S")
            url = f"https://api.tomtom.com/routing/1/calculateRoute/{locations}/json?key={self.api_key}&traffic=true&departAt={depart_at}&computeTravelTimeFor=all"
            
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

    def calculate_laps(self, origin, destination, start_hour, end_hour, target_date=None):
        """
        Calculate Late Arrival Probability Score (%) for each hour in the window.
        Risk is derived from the TomTom delay ratio.
        """
        start_coords = self._geocode(origin)
        end_coords = self._geocode(destination)
        
        if not start_coords or not end_coords:
            return {"error": "Invalid locations"}

        locations = f"{start_coords['lat']},{start_coords['lon']}:{end_coords['lat']},{end_coords['lon']}"
        
        # Parse target_date if provided
        selected_date = None
        if target_date:
            try:
                selected_date = datetime.strptime(target_date, "%Y-%m-%d").date()
            except:
                selected_date = None

        now = datetime.now()
        hours_to_check = []
        if end_hour >= start_hour:
             hours_to_check = range(start_hour, end_hour + 1)
        else:
             hours_to_check = range(start_hour, 24)
        
        results = []
        for hour in hours_to_check:
            if selected_date:
                check_time = datetime.combine(selected_date, datetime.min.time()).replace(hour=hour)
            else:
                check_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
                if check_time < now:
                    check_time += timedelta(days=1)
                
            depart_at = check_time.strftime("%Y-%m-%dT%H:%M:%S")
            url = f"https://api.tomtom.com/routing/1/calculateRoute/{locations}/json?key={self.api_key}&traffic=true&departAt={depart_at}&computeTravelTimeFor=all"
            
            try:
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    routes = data.get("routes", [])
                    if routes:
                        summary = routes[0].get("summary", {})
                        travel_time = summary.get("travelTimeInSeconds", 0)
                        no_traffic_time = summary.get("noTrafficTravelTimeInSeconds", 0)
                        
                        if no_traffic_time > 0:
                            delay_ratio = travel_time / no_traffic_time
                            # Risk mapping:
                            # 1.0 ratio -> 0% risk
                            # 1.5 ratio -> 50% risk
                            # 2.0+ ratio -> 90-100% risk
                            risk = max(0, min(100, round((delay_ratio - 1) * 100 * 1.5)))
                        else:
                            risk = 0
                        
                        # 12-hour format label
                        period = "AM" if hour < 12 else "PM"
                        h12 = hour % 12
                        if h12 == 0: h12 = 12
                        time_label = f"{h12} {period}"

                        results.append({
                            "hour": hour,
                            "time_label": time_label,
                            "risk": risk
                        })
            except:
                continue
        
        return results


class WeatherService:
    """
    Uses the free Open-Meteo API (no API key required) to get weather forecasts.
    https://open-meteo.com/
    """
    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    # WMO Weather Codes mapping
    WMO_CONDITIONS = {
        # Sunny / Clear
        0: "sunny", 1: "sunny",
        # Partly cloudy / overcast (treat as mild/sunny)
        2: "sunny", 3: "sunny",
        # Fog
        45: "cold", 48: "cold",
        # Drizzle
        51: "rainy", 53: "rainy", 55: "rainy",
        56: "rainy", 57: "rainy",
        # Rain
        61: "rainy", 63: "rainy", 65: "rainy",
        66: "rainy", 67: "rainy",
        # Snow (cold)
        71: "cold", 73: "cold", 75: "cold", 77: "cold",
        # Showers
        80: "rainy", 81: "rainy", 82: "rainy",
        # Snow showers
        85: "cold", 86: "cold",
        # Thunderstorm
        95: "windy", 96: "windy", 99: "windy",
    }

    CONDITION_MESSAGES = {
        "sunny": {
            "emoji": "☀️",
            "label": "Sunny",
            "message": "Sun might drain your energy",
            "image": "sunny.webp"
        },
        "pleasant": {
            "emoji": "🌤️",
            "label": "Pleasant",
            "message": "Perfect weather to hit the road! Enjoy the ride 🎉",
            "image": "pleasant.webp"
        },
        "cold": {
            "emoji": "🥶",
            "label": "Cold",
            "message": "You might become a freezing block of ice",
            "image": "cold.webp"
        },
        "rainy": {
            "emoji": "🌧️",
            "label": "Rainy",
            "message": "You might soak in rain, not the ideal weather to travel maybe",
            "image": "rainy.webp"
        },
        "windy": {
            "emoji": "🌪️",
            "label": "Windy / Stormy",
            "message": "Strong winds ahead! Hold onto your steering wheel tight",
            "image": "windy.webp"
        }
    }

    def get_forecast(self, lat, lon, start_hour, end_hour, target_date=None):
        """
        Get weather forecast for a location and time window.
        target_date: optional "YYYY-MM-DD" string for a specific date (up to 16 days ahead).
        Returns dict with condition, temperature, message, image, etc.
        """
        try:
            now = datetime.now()
            
            # Calculate how many forecast days we need
            forecast_days = 2
            selected_date = None
            if target_date:
                try:
                    selected_date = datetime.strptime(target_date, "%Y-%m-%d").date()
                    days_ahead = (selected_date - now.date()).days
                    forecast_days = max(3, min(days_ahead + 2, 16))  # Open-Meteo supports up to 16 days with extra cushion
                except:
                    selected_date = None
            
            params = {
                "latitude": lat,
                "longitude": lon,
                "hourly": "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m",
                "forecast_days": forecast_days,
                "timezone": "auto"
            }
            resp = requests.get(self.BASE_URL, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            temps = hourly.get("temperature_2m", [])
            codes = hourly.get("weather_code", [])
            winds = hourly.get("wind_speed_10m", [])
            humidity = hourly.get("relative_humidity_2m", [])

            if not times:
                return {"error": "No forecast data available"}

            # Filter hours based on target date or auto-detect
            filtered_indices = []
            
            if selected_date:
                # Use the specific selected date
                for i, t in enumerate(times):
                    try:
                        dt = datetime.strptime(t, "%Y-%m-%dT%H:%M")
                        if dt.date() == selected_date and start_hour <= dt.hour <= end_hour:
                            filtered_indices.append(i)
                    except:
                        continue
            else:
                # Original logic: use today's remaining hours or tomorrow
                for i, t in enumerate(times):
                    try:
                        dt = datetime.strptime(t, "%Y-%m-%dT%H:%M")
                        if dt >= now and start_hour <= dt.hour <= end_hour:
                            filtered_indices.append(i)
                    except:
                        continue

                # If no future hours match, just use tomorrow's window
                if not filtered_indices:
                    tomorrow = now + timedelta(days=1)
                    for i, t in enumerate(times):
                        try:
                            dt = datetime.strptime(t, "%Y-%m-%dT%H:%M")
                            if dt.date() == tomorrow.date() and start_hour <= dt.hour <= end_hour:
                                filtered_indices.append(i)
                        except:
                            continue

            if not filtered_indices:
                return {"error": "No data for the selected time window"}

            # Compute averages and dominant condition
            avg_temp = round(sum(temps[i] for i in filtered_indices) / len(filtered_indices), 1)
            avg_wind = round(sum(winds[i] for i in filtered_indices) / len(filtered_indices), 1)
            avg_humidity = round(sum(humidity[i] for i in filtered_indices) / len(filtered_indices), 1)

            # Count condition occurrences
            condition_counts = {"sunny": 0, "pleasant": 0, "cold": 0, "rainy": 0, "windy": 0}
            for i in filtered_indices:
                code = codes[i]
                cond = self.WMO_CONDITIONS.get(code, "sunny")
                condition_counts[cond] += 1

            # Override to cold if temperature is below 10°C regardless of code
            if avg_temp < 10:
                condition_counts["cold"] += len(filtered_indices)

            # Override to windy if avg wind > 40 km/h
            if avg_wind > 40:
                condition_counts["windy"] += len(filtered_indices)

            # Pleasant: sunny/clear with comfortable temp (15-30°C) and calm wind
            if 15 <= avg_temp <= 30 and avg_wind < 25:
                if condition_counts["sunny"] > 0 and condition_counts["rainy"] == 0 and condition_counts["windy"] == 0:
                    condition_counts["pleasant"] += condition_counts["sunny"] + len(filtered_indices)
                    condition_counts["sunny"] = 0

            # Get dominant condition
            dominant = max(condition_counts, key=condition_counts.get)
            info = self.CONDITION_MESSAGES[dominant]

            return {
                "condition": dominant,
                "label": info["label"],
                "emoji": info["emoji"],
                "message": info["message"],
                "image": info["image"],
                "temperature": avg_temp,
                "wind_speed": avg_wind,
                "humidity": avg_humidity,
                "hours_analyzed": len(filtered_indices)
            }

        except Exception as e:
            return {"error": str(e)}
