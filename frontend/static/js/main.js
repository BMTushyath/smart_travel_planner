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
                            <span class="v-details">${v.mileage} ${v.type === 'ev' ? 'km/kWh' : 'km/l'} • ${v.fuel_type.toUpperCase()}</span>
                        </div>
                        <button type="button" class="btn-delete-vehicle" data-id="${v.id}" title="Delete vehicle">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </li>
                `).join('');
            }

            // Populate Dropdowns
            const tripDropdown = document.getElementById('trip-vehicle-id');
            const planDropdown = document.getElementById('plan-vehicle-id');
            const options = '<option value="" disabled selected>Select a Vehicle</option>' +
                vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');

            if (tripDropdown) tripDropdown.innerHTML = options;
            if (planDropdown) planDropdown.innerHTML = options;
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

        const fuel_type = document.getElementById('v-fuel').value;
        try {
            const res = await fetch('/api/vehicle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, mileage, type, fuel_type })
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
        const vehicleEl = document.getElementById('plan-vehicle-id');
        const vehicleId = vehicleEl ? vehicleEl.value : null;
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

                await fetchPrediction(startTime, endTime, distanceText, durationText, start, end, planDate, vehicleId);
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

async function fetchPrediction(startTime, endTime, distanceText, durationText, start, end, date, vehicleId) {
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
                date: date,
                vehicle_id: vehicleId
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

        const insights = data.date_insights || {};
        const insightHtml = insights.type ? `
            <div class="insight-badge ${insights.type.toLowerCase().replace(' ', '-')}">
                <i class="fas fa-calendar-info"></i> ${insights.event !== 'None' ? insights.event : insights.type}
            </div>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0.5rem 0;">
                <strong>Event Impact:</strong> ${insights.impact}
            </p>
        ` : '';

        resultDiv.innerHTML = `
            <div class="recommendation-box">
                <i class="fas fa-route"></i>
                <div>
                    <strong>Trip Details:</strong><br>
                    Distance: ${distanceText}<br>
                    Current ETA: ${durationText}<br>
                    <hr style="border-color: var(--glass-border); margin: 0.5rem 0;">
                    ${insightHtml}
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
            let buildRouteHtml = (route, isPrimary) => {
                if (!route) return "";
                const roadType = route.road_type ? ` [${route.road_type}]` : "";
                const fuelSaved = route.fuel_saved || 0;
                const timeSaved = Math.round((route.time_saved_sec || 0) / 60);

                const fuelIcon = fuelSaved >= 0 ? 'fa-arrow-down' : 'fa-arrow-up';
                const fuelColor = fuelSaved >= 0 ? '#22c55e' : '#ef4444';
                const timeIcon = timeSaved >= 0 ? 'fa-arrow-down' : 'fa-arrow-up';
                const timeColor = timeSaved >= 0 ? '#22c55e' : '#ef4444';

                let jamHtml = '';
                if (route.jam_spots && route.jam_spots.length > 0) {
                    jamHtml = `<div style="font-size: 0.75rem; color: #9a3412; margin-top: 0.2rem;"><i class="fas fa-exclamation-triangle"></i> Jams at: ${route.jam_spots.join(', ')}</div>`;
                }

                return `
                <div class="traffic-alt" style="margin-top: 0.5rem; ${!isPrimary ? 'border-top: 1px dashed var(--glass-border); padding-top: 0.5rem;' : ''}">
                    <strong><i class="fas ${isPrimary ? 'fa-check-circle' : 'fa-directions'}"></i> ${isPrimary ? 'Optimal Route' : 'Alternative Route'}</strong><br>
                    <span>Via: ${route.via_point}${roadType}</span>
                    ${jamHtml}
                    <div class="route-stats-row" style="display: flex; gap: 1rem; margin-top: 0.4rem; font-size: 0.85rem;">
                        <div class="route-stat-item" style="color: ${fuelColor};">
                            <i class="fas fa-droplet"></i> ${Math.abs(fuelSaved).toFixed(1)}L <i class="fas ${fuelIcon}"></i>
                        </div>
                        <div class="route-stat-item" style="color: ${timeColor};">
                            <i class="fas fa-clock"></i> ${Math.abs(timeSaved)}m <i class="fas ${timeIcon}"></i>
                        </div>
                    </div>
                </div>
                `;
            };

            let routeInfoHtml = buildRouteHtml(data.primary, true);

            if (data.alternative && data.alternative.via_point) {
                routeInfoHtml += buildRouteHtml(data.alternative, false);
            }

            // Date Insight
            const dateInsightDiv = document.getElementById('date-insight-container');
            if (dateInsightDiv && data.date_insights) {
                dateInsightDiv.innerHTML = `
                    <div class="date-tag ${data.date_insights.type.toLowerCase()}">
                        <i class="fas fa-calendar-day"></i> ${data.date_insights.type}: ${data.date_insights.event !== 'None' ? data.date_insights.event : 'Regular Day'}
                    </div>
                    <div class="date-impact">${data.date_insights.impact}</div>
                `;
                dateInsightDiv.classList.remove('hidden');
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

            // If traffic is high/critical, highlight the card
            if (data.traffic_level === 'High' || data.traffic_level === 'Critical') {
                trafficCard.style.borderColor = 'var(--accent-danger)';
            } else {
                trafficCard.style.borderColor = 'var(--glass-border)';
            }

            // Fetch Monitor Status
            fetchMonitor();
        }

        // Show Navigation Link - Reverted back to Google Maps
        const navLink = document.getElementById('nav-link');
        if (navLink) {
            navLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(end)}&travelmode=driving`;
            navLink.classList.remove('hidden');
        }

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
            body: JSON.stringify({ origin: start, destination: end, start_hour: startTime, end_hour: endTime, date: date })
        });
        const data = await res.json();
        const weatherCard = document.getElementById('weather-engine-card');
        const weatherContent = document.getElementById('weather-engine-content');
        if (!weatherCard || !weatherContent) return;

        if (!res.ok || data.error) {
            weatherContent.innerHTML = `<div class="loader-placeholder">Could not fetch weather data.</div>`;
            return;
        }

        weatherCard.classList.remove('hidden');
        weatherCard.style.display = 'block';

        const imagePath = `/static/images/${data.image}`;

        // Generate Dynamic Tip
        let tip = "Drive safely in this weather.";
        let tipIcon = "fa-lightbulb";
        if (data.condition === 'rainy') { tip = "Carry an umbrella and check wipers."; tipIcon = "fa-umbrella"; }
        else if (data.condition === 'windy') { tip = "Hold the steering firmly."; tipIcon = "fa-wind"; }
        else if (data.temperature > 30) { tip = "Check cooling system & tire pressure."; tipIcon = "fa-thermometer-half"; }
        else if (data.temperature < 18) { tip = "Engine warm-up recommended."; tipIcon = "fa-snowflake"; }

        weatherContent.innerHTML = `
            <div class="weather-display-grid">
                <div class="weather-main-info">
                    <div class="weather-title">${data.temperature}°C</div>
                    <div class="weather-label">${data.label} ${data.emoji}</div>
                    <div class="weather-meta-info">Analyzed over ${data.hours_analyzed}h window</div>
                </div>
                <div class="weather-image-container">
                    <img src="${imagePath}" alt="${data.label}" style="width: 80px; height: auto; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));" onerror="this.style.display='none'">
                </div>
            </div>

            <div class="weather-stats-grid">
                <div class="weather-stat-icon-box">
                    <i class="fas fa-eye"></i>
                    <div class="weather-stat-val">${data.visibility_km} km</div>
                    <div class="weather-stat-lab">${data.visibility_desc.split(' ')[0]}</div>
                </div>
                <div class="weather-stat-icon-box">
                    <i class="fas fa-wind"></i>
                    <div class="weather-stat-val">${data.wind_speed} km/h</div>
                    <div class="weather-stat-lab">Wind</div>
                </div>
                <div class="weather-stat-icon-box">
                    <i class="fas fa-tint"></i>
                    <div class="weather-stat-val">${data.humidity}%</div>
                    <div class="weather-stat-lab">Humid</div>
                </div>
                <div class="weather-stat-icon-box">
                    <i class="fas ${tipIcon}"></i>
                    <div class="weather-stat-val" style="font-size: 0.75rem; text-align: center;">${tip}</div>
                    <div class="weather-stat-lab">Tip</div>
                </div>
            </div>

            <div class="impact-alert">
                <i class="fas fa-bolt"></i>
                <div class="impact-text">
                    <h4>+${data.traffic_spike_pct}% Traffic Risk</h4>
                    <p>${data.message}</p>
                </div>
            </div>
        `;

        // Color accent the card border
        const borderColors = { sunny: '#f59e0b', pleasant: '#22c55e', cold: '#3b82f6', rainy: '#6366f1', windy: '#ef4444' };
        weatherCard.style.borderLeftColor = borderColors[data.condition] || 'var(--accent-primary)';

    } catch (err) { console.error(err); }
}

// LAPS (Late Arrival Probability Score) Logic
async function fetchLAPS(start, end, startTime, endTime, date) {
    try {
        const res = await fetch('/api/laps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: start, destination: end, start_hour: startTime, end_hour: endTime, date: date })
        });
        const data = await res.json();
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
            let riskColor = '#22c55e';
            if (item.risk > 30) riskColor = '#fbbf24';
            if (item.risk > 70) riskColor = '#ef4444';

            let hotspotHtml = '';
            if (item.jam_spots && item.jam_spots.length > 0) {
                hotspotHtml = `<div class="hotspot-container">`;
                item.jam_spots.forEach(spot => {
                    hotspotHtml += `<div class="hotspot-badge-item"><i class="fas fa-map-marker-alt"></i> ${spot}</div>`;
                });
                hotspotHtml += `</div>`;
            }

            lapsHtml += `
            <div class="laps-timeline-wrapper">
                <div class="laps-hour-timeline-item">
                    <div class="laps-time-bubble">${item.time_label}</div>
                    <div class="laps-bar-track">
                        <div class="laps-bar-fill" style="width: ${item.risk}%; background-color: ${riskColor};"></div>
                    </div>
                    <div class="laps-percentage" style="color: ${riskColor}">${item.risk}%</div>
                </div>
                ${hotspotHtml}
            </div>
            `;
        });
        lapsHtml += `</div>`;
        lapsContent.innerHTML = lapsHtml;

    } catch (err) { console.error("LAPS fetch error:", err); }
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
            resultDiv.innerHTML = `< span style = "color:red" > ${data.error}</span > `;
        } else {
            resultDiv.innerHTML = `
            <div class="result-item" > <strong>Distance:</strong> ${distanceText}</div>
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
// Monitor Logic
async function fetchMonitor() {
    try {
        const res = await fetch('/api/monitor');
        const data = await res.json();
        const content = document.getElementById('monitor-content');
        if (!content) return;

        let html = '<div class="monitor-display">';

        if (data.speed_drop.detected) {
            html += `
            < div class="monitor-alert warning" >
                    <i class="fas fa-tachometer-alt"></i>
                    <div>
                        <strong>Speed Drop Detected!</strong><br>
                        ${data.speed_drop.message} (-${data.speed_drop.amount} km/h)
                    </div>
                </div >
            `;
        }

        if (data.off_peak_congestion.detected) {
            html += `
            < div class="monitor-alert danger" >
                    <i class="fas fa-hourglass-half"></i>
                    <div>
                        <strong>Unusual Congestion!</strong><br>
                        ${data.off_peak_congestion.message}
                    </div>
                </div >
            `;
        }

        if (!data.speed_drop.detected && !data.off_peak_congestion.detected) {
            html += '<div class="monitor-status-ok"><i class="fas fa-check-circle"></i> Monitoring Active: No anomalies detected.</div>';
        }

        html += '</div>';
        content.innerHTML = html;
        const modal = document.getElementById('monitor-modal');
        if (modal) {
            // We don't auto-show modal, just pulse the button
        }

    } catch (err) {
        console.error("Monitor fetch error:", err);
    }
}

// Modal Toggle Logic
const monitorModal = document.getElementById('monitor-modal');
const monitorBtn = document.getElementById('live-monitor-btn');
const closeMonitor = document.getElementById('close-monitor');

if (monitorBtn) {
    monitorBtn.addEventListener('click', () => {
        monitorModal.classList.remove('hidden');
        fetchMonitor(); // Refresh data on open
    });
}

if (closeMonitor) {
    closeMonitor.addEventListener('click', () => {
        monitorModal.classList.add('hidden');
    });
}

window.addEventListener('click', (e) => {
    if (e.target == monitorModal) {
        monitorModal.classList.add('hidden');
    }
});
