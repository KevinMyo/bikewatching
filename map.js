mapboxgl.accessToken = 'pk.eyJ1IjoiYW15bzE4IiwiYSI6ImNtN2NkbzkyMzBvajEycW9jeWxiM3M3aXQifQ.0GNbi0RZSRrYpSsLrSYxfw';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027], 
  zoom: 12,
  minZoom: 5,
  maxZoom: 18
});

const timeSlider = document.getElementById("time-slider");
const selectedTime = document.getElementById("selected-time");
const anyTimeLabel = document.getElementById("any-time");

let timeFilter = -1;

let stations = [];
let trips = [];
let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

const stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

const stationUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

map.on('load', () => {
  const svg = d3.select('#map').append('svg')
    .style('position', 'absolute')
    .style('z-index', '1')
    .style('width', '100%')
    .style('height', '100%')
    .style('pointer-events', 'none');


  Promise.all([
    d3.json(stationUrl),
    d3.csv(trafficUrl)
  ]).then(([stationData, tripData]) => {
    stations = stationData.data.stations;
    trips = tripData;

    trips.forEach(trip => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);

      let startedMinutes = minutesSinceMidnight(trip.started_at);
      let endedMinutes = minutesSinceMidnight(trip.ended_at);
      departuresByMinute[startedMinutes].push(trip);
      arrivalsByMinute[endedMinutes].push(trip);
    });

    processTrafficData();

    drawStations(svg);

    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    updatePositions();
  }).catch(error => console.error('Error loading data:', error));
});

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function processTrafficData() {
  filteredDepartures = timeFilter === -1 ? departuresByMinute.flat() : filterByMinute(departuresByMinute, timeFilter);
  filteredArrivals = timeFilter === -1 ? arrivalsByMinute.flat() : filterByMinute(arrivalsByMinute, timeFilter);

  let departuresMap = d3.rollup(filteredDepartures, v => v.length, d => String(d.start_station_id).trim().toUpperCase());
  let arrivalsMap = d3.rollup(filteredArrivals, v => v.length, d => String(d.end_station_id).trim().toUpperCase());

  filteredStations = stations.map(station => {
    station = { ...station };
    let id = String(station.short_name).trim().toUpperCase();
    station.departures = departuresMap.get(id) ?? 0;
    station.arrivals = arrivalsMap.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;
    return station;
  });

  updateVisualization();
}

function filterByMinute(tripsByMinute, minute) {
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    return [...tripsByMinute.slice(minMinute), ...tripsByMinute.slice(0, maxMinute)].flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

function drawStations(svg) {
  const circles = svg.selectAll("circle")
    .data(filteredStations)
    .enter()
    .append("circle")
    .attr("fill", "steelblue")
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .attr("opacity", 0.6)
    .attr("r", d => radiusScale(d.totalTraffic)) 
    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic))
    .each(function(d) {
      d3.select(this)
        .append("title")
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });

  updatePositions();
}

function radiusScale(value) {
  return d3.scaleSqrt()
    .domain([0, d3.max(filteredStations, d => d.totalTraffic)])
    .range(timeFilter === -1 ? [3, 25] : [3, 50])(value);
}

function updatePositions() {
  d3.selectAll("circle")
    .attr("cx", d => getCoords(d).cx)
    .attr("cy", d => getCoords(d).cy);
}

function getCoords(station) {
  const lon = parseFloat(station.lon);
  const lat = parseFloat(station.lat);
  if (isNaN(lon) || isNaN(lat)) return { cx: -100, cy: -100 };

  const point = new mapboxgl.LngLat(lon, lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);

  if (timeFilter === -1) {
    selectedTime.textContent = "";
    anyTimeLabel.style.display = "block";
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = "none";
  }

  processTrafficData();
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString("en-US", { timeStyle: "short" });
}

timeSlider.addEventListener("input", updateTimeDisplay);
updateTimeDisplay();

function updateVisualization() {
  d3.selectAll("circle")
    .data(filteredStations)
    .transition().duration(200)
    .attr("r", d => radiusScale(d.totalTraffic))
    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic))
    .select("title")
    .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
}
