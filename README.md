# Krivox - Smart Travel Planner

## Project Overview
Krivox is a smart travel planning application that helps users find the best time to travel between cities using real-time traffic data and predictive analysis. It also estimates fuel costs and EV charging requirements.

## Features
- **Smart Trip Planning**: Finds the optimal departure time based on historical and real-time traffic.
- **Real-Time Routing**: Uses TomTom API for accurate distance and duration.
- **Fuel/EV Predictor**: Estimates travel costs and fuel/charge needs.
- **Vehicle Management**: Manage your vehicles and their mileage/efficiency.

## Setup Instructions (For New Laptop)

If you need to run this on a different computer, follow these steps:

### 1. Prerequisites
- **Python**: Make sure Python (3.8 or higher) is installed.
- **Internet Connection**: Required for API calls.

### 2. Installation
1.  **Copy Code**: Download/Clone this project folder.
2.  **Install Dependencies**:
    Open a terminal in the project folder and run:
    ```bash
    pip install -r requirements.txt
    ```

### 3. Configuration (Important!)
You must create a file named `.env` in the project root folder (same place as `backend/` folder).
**Do not share this file publicly.**

**Content of `.env`:**
```ini
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///app.db
FUEL_API_KEY=your-fuel-api-key-here
TOMTOM_API_KEY=your-tomtom-api-key-here
```

### 4. Running the App
1.  Open terminal in the project folder.
2.  Run the backend:
    ```bash
    python backend/app.py
    ```
3.  Open your browser and go to: `http://127.0.0.1:5000`

## Tech Stack
- **Backend**: Flask (Python)
- **Frontend**: HTML, CSS, JavaScript
- **Database**: SQLite
- **APIs**: TomTom Traffic/Routing, Fuel Price API
