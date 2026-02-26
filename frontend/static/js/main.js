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
                        <span class="v-name">${v.name}</span>
                        <span class="v-details">${v.mileage} ${v.type === 'ev' ? 'km/kWh' : 'km/l'} (${v.type.toUpperCase()})</span>
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



// Plan Your Trip Logic
const plannerForm = document.getElementById('planner-form');
if (plannerForm) {
    plannerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const start = document.getElementById('plan-start-loc').value;
        const end = document.getElementById('plan-end-loc').value;
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

                await fetchPrediction(startTime, endTime, distanceText, durationText, start, end);
            } else {
                alert(routeData.error || "Failed to calculate route");
            }
        } catch (err) {
            console.error(err);
            alert("Error connecting to routing service");
        }
    });
}

async function fetchPrediction(startTime, endTime, distanceText, durationText, start, end) {
    // 2. Get Best Time Prediction and Traffic Alerts from Backend
    try {
        const res = await fetch('/api/smart_plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_hour: startTime,
                end_hour: endTime,
                origin: start,
                destination: end
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

            const levelClass = `level-${data.traffic_level.toLowerCase()}`;

            // Build Optimal Route HTML
            let routeInfoHtml = `
                <div class="traffic-alt">
                    <strong><i class="fas fa-check-circle"></i> Optimal Route Selected</strong><br>
                    <span>Via: ${data.via_point}</span>
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
                    <div style="font-size: 1.5rem; font-weight: 700;">${data.best_alt_time}</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 1rem;">Avg Speed: ${data.best_alt_speed} km/h</div>
                    
                    <span class="traffic-level ${levelClass}">${data.traffic_level} Traffic</span>
                    
                    <div class="traffic-reason" style="margin-top: 0.5rem; font-style: italic; font-size: 0.85rem;">${data.reason}</div>
                    
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
