// Auth Toggle
function toggleAuth() {
    const loginBox = document.getElementById('login-box');
    const signupBox = document.getElementById('signup-box');
    loginBox.classList.toggle('hidden');
    signupBox.classList.toggle('hidden');
}

// Handle Login
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, action: 'login' })
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = data.redirect;
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            alert('Login failed');
        }
    });
}

// Handle Signup
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, action: 'signup' })
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = data.redirect;
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            alert('Signup failed');
        }
    });
}

// Load Vehicles
async function loadVehicles() {
    try {
        const res = await fetch('/api/vehicle');
        if (res.ok) {
            const vehicles = await res.json();

            // Populate List
            const listContainer = document.getElementById('vehicle-list');
            if (listContainer) {
                listContainer.innerHTML = vehicles.map(v => `
                    <li>
                        <div class="v-info">
                            <span class="v-name">${v.name}</span>
                            <span class="v-details">${v.mileage} ${v.type === 'ev' ? 'km/kWh' : 'km/l'} (${v.type.toUpperCase()})</span>
                        </div>
                        <button type="button" class="btn-delete-vehicle" data-id="${v.id}" title="Delete vehicle">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </li>
                `).join('');
            }

            // Populate Dropdown
            const dropdown = document.getElementById('trip-vehicle-id');
            if (dropdown) {
                dropdown.innerHTML = '<option value="" disabled selected>Select a Vehicle</option>' +
                    vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
            }
        }
    } catch (err) {
        console.error("Failed to load vehicles", err);
    }
}

// Call loadVehicles on page load if on dashboard
if (document.getElementById('vehicle-list')) {
    loadVehicles();

    // Event Delegation for Delete Buttons
    const listContainer = document.getElementById('vehicle-list');
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.btn-delete-vehicle');
            if (deleteBtn) {
                const vehicleId = deleteBtn.getAttribute('data-id');
                deleteVehicle(vehicleId);
            }
        });
    }
}

// Vehicle Form
const vehicleForm = document.getElementById('vehicle-form');
if (vehicleForm) {
    vehicleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('v-name').value;
        const mileage = document.getElementById('v-mileage').value;
        const type = document.getElementById('v-type').value;

        try {
            const res = await fetch('/api/vehicle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, mileage, type })
            });
            const data = await res.json();
            const msgDiv = document.getElementById('vehicle-msg');
            msgDiv.innerText = data.message;
            msgDiv.className = 'msg-box success';
            setTimeout(() => {
                msgDiv.innerText = '';
                msgDiv.className = 'msg-box';
            }, 3000);
            vehicleForm.reset();
            loadVehicles(); // Reload list and dropdown
        } catch (err) {
            console.error(err);
        }
    });
}

// Delete Vehicle
async function deleteVehicle(vehicleId) {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;

    try {
        const res = await fetch(`/api/vehicle/${vehicleId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok) {
            loadVehicles(); // Refresh list and dropdown
        } else {
            alert(data.error || 'Failed to delete vehicle');
        }
    } catch (err) {
        console.error(err);
        alert('Error deleting vehicle');
    }
}



// Plan Your Trip Logic
const plannerForm = document.getElementById('planner-form');
if (plannerForm) {
    plannerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const start = document.getElementById('plan-start-loc').value;
        const end = document.getElementById('plan-end-loc').value;
        const planDate = document.getElementById('plan-date').value;
        const startTime = document.getElementById('plan-start-time').value;
        const endTime = document.getElementById('plan-end-time').value;

        if (!start || !end) {
            alert("Please enter start and destination.");
            return;
        }

        // Call TomTom Routing API via Backend
        let distanceText = "Calculating...";
        let durationText = "Calculating...";

        try {
            const routeRes = await fetch('/api/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin: start, destination: end })
            });
            const routeData = await routeRes.json();

            if (routeRes.ok) {
                distanceText = `${routeData.distance_km} km`;
                durationText = routeData.duration_formatted;

                // Show Map Placeholder
                const mapEl = document.getElementById('map');
                if (mapEl) {
                    mapEl.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Route calculated using TomTom API.</div>';
                    mapEl.classList.remove('hidden');
                    mapEl.style.display = 'block';
                }

                await fetchPrediction(startTime, endTime, distanceText, durationText, start, end, planDate);
                // Also fetch weather and LAPS for the travel window
                await fetchWeather(start, end, startTime, endTime, planDate);
                await fetchLAPS(start, end, startTime, endTime, planDate);
            } else {
                alert(routeData.error || "Failed to calculate route");
            }
        } catch (err) {
            console.error(err);
            alert("Error connecting to routing service");
        }
    });
}

async function fetchPrediction(startTime, endTime, distanceText, durationText, start, end, date) {
    // 2. Get Best Time Prediction and Traffic Alerts from Backend
    try {
        const res = await fetch('/api/smart_plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_hour: startTime,
                end_hour: endTime,
                origin: start,
                destination: end,
                date: date
            })
        });
        const data = await res.json();
        console.log("Prediction Data:", data);

        if (!res.ok) {
            console.error("Prediction Error:", data);
            return;
        }

        // Update Option 2 Recommendation Box
        const resultDiv = document.getElementById('planner-result');
        resultDiv.classList.remove('hidden');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div class="recommendation-box">
                <i class="fas fa-route"></i>
                <div>
                    <strong>Trip Details:</strong><br>
                    Distance: ${distanceText}<br>
                    Current ETA: ${durationText}<br>
                    <hr style="border-color: var(--glass-border); margin: 0.5rem 0;">
                    <strong style="color: var(--accent-secondary);">Best time to travel :</strong><br>
                    ${data.message}
                </div>
            </div>
        `;

        // Update Option 4: nativeguru Card
        const trafficCard = document.getElementById('traffic-alert-card');
        const trafficContent = document.getElementById('traffic-alert-content');

        if (trafficCard && trafficContent) {
            trafficCard.classList.remove('hidden');
            trafficCard.style.display = 'block';

            const trafficLevel = data.traffic_level || "Low";
            const levelClass = `level-${trafficLevel.toLowerCase()}`;

            // Build Optimal Route HTML
            let routeInfoHtml = `
                <div class="traffic-alt">
                    <strong><i class="fas fa-check-circle"></i> Optimal Route Selected</strong><br>
                    <span>Via: ${data.via_point || 'Primary Route'}</span>
                </div>
            `;

            // Build Alternative Route HTML if it exists and primary traffic is not High
            // Or if user specifically wants to see it to skip traffic
            if (data.alt_route && data.alt_route.via_point) {
                routeInfoHtml += `
                    <div class="traffic-alt" style="margin-top: 0.5rem; border-top: 1px dashed var(--glass-border); padding-top: 0.5rem;">
                        <strong><i class="fas fa-directions"></i> Best Alternate Route:</strong><br>
                        <span>Via: ${data.alt_route.via_point} (${data.alt_route.duration})</span>
                    </div>
                `;
            }

            trafficContent.innerHTML = `
                <div class="traffic-alert-item" style="text-align: center;">
                    <div style="font-weight: 600; color: var(--accent-secondary); margin-bottom: 0.25rem;">Suggested time to start</div>
                    <div style="font-size: 1.5rem; font-weight: 700;">${data.best_alt_time || 'N/A'}</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 1rem;">Avg Speed: ${data.best_alt_speed || 0} km/h</div>
                    
                    <span class="traffic-level ${levelClass}">${trafficLevel} Traffic</span>
                    
                    <div class="traffic-reason" style="margin-top: 0.5rem; font-style: italic; font-size: 0.85rem;">${data.reason || 'Normal traffic expected.'}</div>
                    
                    <div style="text-align: left; margin-top: 1rem;">
                        ${routeInfoHtml}
                    </div>
                </div>
            `;

            // If traffic is high, highlight the card or add a special notification
            if (data.traffic_level === 'High') {
                trafficCard.style.borderColor = 'var(--accent-danger)';
            } else {
                trafficCard.style.borderColor = 'var(--glass-border)';
            }
        }

        // Show Navigation Link - Reverted back to Google Maps
        const navLink = document.getElementById('nav-link');
        navLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(end)}&travelmode=driving`;
        navLink.classList.remove('hidden');

    } catch (err) {
        console.error(err);
    }
}

// Weather Engine Logic
async function fetchWeather(start, end, startTime, endTime, date) {
    try {
        const res = await fetch('/api/weather', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                origin: start,
                destination: end,
                start_hour: startTime,
                end_hour: endTime,
                date: date
            })
        });
        const data = await res.json();
        console.log("Weather Data:", data);

        const weatherCard = document.getElementById('weather-engine-card');
        const weatherContent = document.getElementById('weather-engine-content');

        if (!weatherCard || !weatherContent) return;

        if (!res.ok || data.error) {
            weatherContent.innerHTML = `<div class="loader-placeholder">Could not fetch weather data.</div>`;
            return;
        }

        weatherCard.classList.remove('hidden');
        weatherCard.style.display = 'block';

        const condClass = `weather-${data.condition}`;
        const imagePath = `/static/images/${data.image}`;

        weatherContent.innerHTML = `
            <div class="weather-display" style="text-align: center;">
                <div class="weather-image-wrapper">
                    <img src="${imagePath}" alt="${data.label}" class="weather-image" onerror="this.style.display='none'">
                </div>
                <div class="weather-emoji">${data.emoji}</div>
                <span class="weather-condition-badge ${condClass}">${data.label}</span>
                
                <div class="weather-stats">
                    <div class="weather-stat">
                        <i class="fas fa-thermometer-half"></i>
                        <span>${data.temperature}°C</span>
                    </div>
                    <div class="weather-stat">
                        <i class="fas fa-wind"></i>
                        <span>${data.wind_speed} km/h</span>
                    </div>
                    <div class="weather-stat">
                        <i class="fas fa-tint"></i>
                        <span>${data.humidity}%</span>
                    </div>
                </div>

                <div class="weather-message ${condClass}-msg">
                    ${data.emoji} ${data.message}
                </div>

                <div class="weather-meta">
                    Based on ${data.hours_analyzed} hours of forecast data
                </div>
            </div>
        `;

        // Color accent the card border
        const borderColors = {
            sunny: '#f59e0b',
            pleasant: '#22c55e',
            cold: '#3b82f6',
            rainy: '#6366f1',
            windy: '#ef4444'
        };
        weatherCard.style.borderLeftColor = borderColors[data.condition] || 'var(--accent-primary)';

    } catch (err) {
        console.error("Weather fetch error:", err);
    }
}

// LAPS (Late Arrival Probability Score) Logic
async function fetchLAPS(start, end, startTime, endTime, date) {
    try {
        const res = await fetch('/api/laps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                origin: start,
                destination: end,
                start_hour: startTime,
                end_hour: endTime,
                date: date
            })
        });
        const data = await res.json();
        console.log("LAPS Data:", data);

        const lapsCard = document.getElementById('laps-card');
        const lapsContent = document.getElementById('laps-content');

        if (!lapsCard || !lapsContent) return;

        if (!res.ok || data.error) {
            lapsContent.innerHTML = `<div class="loader-placeholder">Could not fetch LAPS data.</div>`;
            return;
        }

        lapsCard.classList.remove('hidden');
        lapsCard.style.display = 'block';

        let lapsHtml = `<div class="laps-display">`;

        data.forEach(item => {
            let riskColor = '#22c55e'; // Green
            if (item.risk > 30) riskColor = '#fbbf24'; // Yellow
            if (item.risk > 70) riskColor = '#ef4444'; // Red

            lapsHtml += `
                <div class="laps-hour-item">
                    <div class="laps-time">${item.time_label}</div>
                    <div class="laps-bar-container">
                        <div class="laps-bar" style="width: ${item.risk}%; background-color: ${riskColor};"></div>
                    </div>
                    <div class="laps-score" style="color: ${riskColor}">${item.risk}%</div>
                </div>
            `;
        });

        lapsHtml += `</div>`;
        lapsContent.innerHTML = lapsHtml;

    } catch (err) {
        console.error("LAPS fetch error:", err);
    }
}

// Fuel/EV Charge Predictor Logic
const tripForm = document.getElementById('trip-form');
if (tripForm) {
    tripForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const start = document.getElementById('trip-start').value;
        const end = document.getElementById('trip-end').value;
        const vehicleId = document.getElementById('trip-vehicle-id').value;

        if (!vehicleId) {
            alert("Please select a vehicle first.");
            return;
        }

        // Call TomTom Routing API via Backend
        try {
            const routeRes = await fetch('/api/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin: start, destination: end })
            });
            const routeData = await routeRes.json();

            if (routeRes.ok) {
                const distanceKm = routeData.distance_km;
                const distanceText = `${distanceKm} km`;
                const avgSpeed = routeData.avg_speed_kmh;
                await calculateCost(distanceKm, distanceText, vehicleId, avgSpeed);
            } else {
                alert(routeData.error || "Failed to calculate route");
            }
        } catch (err) {
            console.error(err);
            alert("Error connecting to routing service");
        }
    });
}

async function calculateCost(distanceKm, distanceText, vehicleId, avgSpeed) {
    // 2. Call Backend to Calculate Cost
    try {
        const res = await fetch('/api/calculate_trip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                distance_km: distanceKm,
                vehicle_id: vehicleId
            })
        });
        const data = await res.json();

        const resultDiv = document.getElementById('trip-result');
        resultDiv.classList.remove('hidden');

        if (data.error) {
            resultDiv.innerHTML = `<span style="color:red">${data.error}</span>`;
        } else {
            resultDiv.innerHTML = `
                <div class="result-item"><strong>Distance:</strong> ${distanceText}</div>
                <div class="result-item"><strong>Avg Speed:</strong> ${avgSpeed} km/h</div>
                <div class="result-item"><strong>Fuel Price:</strong> ${data.price_per_unit}/unit</div>
                <div class="result-item"><strong>Fuel Needed:</strong> ${data.fuel_needed} units</div>
                <div class="result-item highlight"><strong>Estimated Cost:</strong> ₹${data.cost}</div>
            `;
        }
    } catch (err) {
        console.error(err);
    }
}
