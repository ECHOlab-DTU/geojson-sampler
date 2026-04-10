// ── Init sliders and static text from CONFIG ───────────────
(function initFromConfig() {
  const ss = document.getElementById('spacing-slider');
  ss.min   = CONFIG.SPACING_MIN_KM;
  ss.max   = CONFIG.SPACING_MAX_KM;
  ss.step  = CONFIG.SPACING_STEP_KM;
  ss.value = CONFIG.SPACING_DEFAULT_KM;
  document.getElementById('spacing-val').textContent = CONFIG.SPACING_DEFAULT_KM.toFixed(1);

  const rs = document.getElementById('radius-slider');
  rs.min   = CONFIG.RADIUS_MIN_M;
  rs.max   = CONFIG.RADIUS_MAX_M;
  rs.step  = CONFIG.RADIUS_STEP_M;
  rs.value = CONFIG.RADIUS_DEFAULT_M;
  document.getElementById('radius-val').textContent = CONFIG.RADIUS_DEFAULT_M;

  document.getElementById('info-note').textContent =
    `$${CONFIG.COST_PER_CALL}/call (Nearby Search Basic). Deduplication will reduce unique place IDs returned.`;
})();

// ── Map ────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: true }).setView(CONFIG.MAP_DEFAULT_VIEW, CONFIG.MAP_DEFAULT_ZOOM);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
  maxZoom: 19
}).addTo(map);

// ── State ──────────────────────────────────────────────────
let geojsonLayer = null, pointsLayer = null, circlesLayer = null;
let sampledPoints = [];
let loadedGeoJSON = null;
let areaKm2 = 0;
let activeWorker = null;
let canvasRenderer = L.canvas({ padding: CONFIG.CANVAS_PADDING });

// ── Refs ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const geojsonInput  = $('geojson-input');
const geojsonError  = $('geojson-error');
const loadBtn       = $('load-btn');
const sampleBtn     = $('sample-btn');
const dropZone      = $('drop-zone');
const fileInput     = $('file-input');
const dzLabel       = $('dz-label');
const spacingSlider = $('spacing-slider');
const spacingVal    = $('spacing-val');
const radiusSlider  = $('radius-slider');
const radiusVal     = $('radius-val');
const statPoints    = $('stat-points');
const statArea      = $('stat-area');
const copyBtn       = $('copy-btn');
const dlBtn         = $('dl-btn');
const infoBox       = $('info-box');
const infoCost      = $('info-cost');

// ── Tabs ───────────────────────────────────────────────────
$('tab-upload').addEventListener('click', () => {
  $('tab-upload').classList.add('active');
  $('tab-paste').classList.remove('active');
  $('pane-upload').style.display = '';
  $('pane-paste').style.display = 'none';
  loadBtn.style.display = 'none';
  clearError();
});

$('tab-paste').addEventListener('click', () => {
  $('tab-paste').classList.add('active');
  $('tab-upload').classList.remove('active');
  $('pane-paste').style.display = '';
  $('pane-upload').style.display = 'none';
  loadBtn.style.display = '';
  clearError();
});

// ── File upload & drag-drop ────────────────────────────────
function handleFile(file) {
  if (!file) return;
  if (!file.name.match(/\.(geojson|json)$/i)) {
    return showError('Please upload a .geojson or .json file');
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const nameEl = document.createElement('strong');
      nameEl.textContent = file.name;
      const sizeText = document.createTextNode(`\n${(file.size / 1024).toFixed(1)} KB`);
      dzLabel.replaceChildren(nameEl, sizeText);
      dropZone.classList.add('loaded');
      clearError();
      loadGeoJSON(parsed);
    } catch (err) {
      dropZone.classList.remove('loaded');
      showError('Invalid JSON in file');
    }
  };
  reader.readAsText(file);
}

fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});


// ── Info box ───────────────────────────────────────────────
function updateInfoBox() {
  if (sampledPoints.length === 0) return;
  infoCost.textContent = `$${(sampledPoints.length * CONFIG.COST_PER_CALL).toFixed(2)}`;
  infoBox.classList.add('show');
}

spacingSlider.addEventListener('input', () => {
  spacingVal.textContent = parseFloat(spacingSlider.value).toFixed(1);
});

radiusSlider.addEventListener('input', () => {
  radiusVal.textContent = parseInt(radiusSlider.value, 10);
  if (sampledPoints.length > 0) redrawCircles();
});

// ── Load button (paste tab) ────────────────────────────────
loadBtn.addEventListener('click', () => {
  const raw = geojsonInput.value.trim();
  if (!raw) return;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { return showError('Invalid JSON — check syntax'); }
  if (!parsed.type) return showError('Missing "type" field');
  loadGeoJSON(parsed);
});

geojsonInput.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') loadBtn.click(); });

// ── Core load function ─────────────────────────────────────
function loadGeoJSON(parsed) {
  if (!parsed.type) return showError('Missing "type" field');

  clearError();
  clearAllLayers();
  sampledPoints = [];
  copyBtn.disabled = dlBtn.disabled = true;
  infoBox.classList.remove('show');
  resetStepIndicators();
  statPoints.textContent = '—';
  statArea.textContent   = '—';

  try {
    geojsonLayer = L.geoJSON(parsed, {
      style: {
        color:       CONFIG.GEOJSON_COLOR,
        weight:      CONFIG.GEOJSON_WEIGHT,
        fillColor:   CONFIG.GEOJSON_FILL_COLOR,
        fillOpacity: CONFIG.GEOJSON_FILL_OPACITY,
        dashArray:   CONFIG.GEOJSON_DASH
      },
      pointToLayer: (f, ll) => L.circleMarker(ll, {
        radius: 5,
        color: CONFIG.GEOJSON_COLOR,
        fillOpacity: 0.6
      })
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds(), { padding: CONFIG.MAP_FIT_PADDING });

    // Rough area from bounding box shown before exact area is known from sampling
    const b = geojsonLayer.getBounds();
    const midLat = (b.getNorth() + b.getSouth()) / 2;
    const kmLat = 111.32, kmLng = 111.32 * Math.cos(midLat * Math.PI / 180);
    areaKm2 = (b.getNorth() - b.getSouth()) * kmLat * (b.getEast() - b.getWest()) * kmLng;

    statArea.textContent = '~' + Math.round(areaKm2).toLocaleString();
    loadedGeoJSON = parsed;
    sampleBtn.disabled = false;
    $('step1-num').classList.add('active');
    $('step2-num').classList.add('active');
  } catch (e) {
    showError('Could not render: ' + e.message);
  }
}

// ── Sample (Web Worker) ────────────────────────────────────
sampleBtn.addEventListener('click', () => {
  if (!loadedGeoJSON) return;

  // Guard against generating a huge number of points that may freeze the browser
  const spacingNow = parseFloat(spacingSlider.value);
  const bboxArea = (() => {
    const b = geojsonLayer.getBounds();
    const midLat = (b.getNorth() + b.getSouth()) / 2;
    const kmLat = 111.32, kmLng = 111.32 * Math.cos(midLat * Math.PI / 180);
    return (b.getNorth() - b.getSouth()) * kmLat * (b.getEast() - b.getWest()) * kmLng;
  })();
  const estPoints = Math.round(bboxArea / (spacingNow * spacingNow));
  if (estPoints > CONFIG.POINT_CAP) {
    if (!confirm(`Estimated ${estPoints.toLocaleString()} points — this may freeze the browser.\n\nContinue?`)) return;
  }

  if (activeWorker) { activeWorker.terminate(); activeWorker = null; }

  sampleBtn.disabled = true;
  sampledPoints = [];

  // Worker streams points in batches so the map updates live while computing
  const workerSrc = `
    importScripts('${CONFIG.TURF_CDN_URL}');
    self.onmessage = function(e) {
      try {
        const { geojson, spacing, batchSize } = e.data;
        const bbox = turf.bbox(geojson);

        // pointGrid mask requires a single Polygon/MultiPolygon, not a FeatureCollection.
        // Extract and union all polygon features into one mask.
        let mask = geojson;
        if (geojson.type === 'FeatureCollection') {
          const polys = geojson.features.filter(f =>
            f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
          );
          if (polys.length === 0) throw new Error('No Polygon features found in FeatureCollection');
          mask = polys.length === 1
            ? polys[0]
            : polys.reduce((a, b) => {
                if (a === null) return b;
                const u = turf.union(a, b);
                return u !== null ? u : a;
              });
        } else if (geojson.type === 'Feature') {
          mask = geojson;
        }

        const grid = turf.pointGrid(bbox, spacing, { units: 'kilometers', mask });
        const areaKm2 = turf.area(geojson) / 1e6;
        const all = grid.features.map(f => ({
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0]
        }));

        // Stream in batches so the map updates visually during compute
        for (let i = 0; i < all.length; i += batchSize) {
          self.postMessage({ type: 'batch', points: all.slice(i, i + batchSize), total: all.length });
        }
        self.postMessage({ type: 'done', areaKm2 });
      } catch(err) {
        self.postMessage({ type: 'error', error: err.message });
      }
    };
  `;

  const blob = new Blob([workerSrc], { type: 'application/javascript' });
  const url  = URL.createObjectURL(blob);
  activeWorker = new Worker(url);
  URL.revokeObjectURL(url);

  clearPointLayers();
  pointsLayer  = L.layerGroup().addTo(map);
  circlesLayer = L.layerGroup().addTo(map);
  const searchRadius = parseInt(radiusSlider.value, 10);

  activeWorker.onmessage = ({ data }) => {
    if (data.type === 'batch') {
      sampledPoints.push(...data.points);
      statPoints.textContent = sampledPoints.length.toLocaleString();

      data.points.forEach(p => {
        const m = L.circleMarker([p.lat, p.lng], {
          renderer:    canvasRenderer,
          radius:      CONFIG.POINT_RADIUS,
          color:       CONFIG.POINT_COLOR,
          weight:      CONFIG.POINT_WEIGHT,
          fillColor:   CONFIG.POINT_FILL_COLOR,
          fillOpacity: CONFIG.POINT_FILL_OPACITY
        });
        m.bindPopup(
          `<span style="font-family:monospace;font-size:11px;line-height:1.8">lat: ${p.lat.toFixed(6)}<br>lng: ${p.lng.toFixed(6)}</span>`,
          { maxWidth: 160 }
        );
        pointsLayer.addLayer(m);

        circlesLayer.addLayer(L.circle([p.lat, p.lng], {
          renderer:    canvasRenderer,
          radius:      searchRadius,
          color:       CONFIG.CIRCLE_COLOR,
          weight:      CONFIG.CIRCLE_WEIGHT,
          fillColor:   CONFIG.CIRCLE_FILL_COLOR,
          fillOpacity: CONFIG.CIRCLE_FILL_OPACITY,
          dashArray:   CONFIG.CIRCLE_DASH
        }));
      });

    } else if (data.type === 'done') {
      activeWorker = null;
      sampleBtn.disabled = false;
      areaKm2 = data.areaKm2;

      statArea.textContent   = Math.round(areaKm2).toLocaleString();
      statPoints.textContent = sampledPoints.length.toLocaleString();
      updateInfoBox();

      if (sampledPoints.length === 0) return;

      $('step3-num').classList.add('active');
      copyBtn.disabled = false;
      dlBtn.disabled   = false;

    } else if (data.type === 'error') {
      activeWorker = null;
      sampleBtn.disabled = false;
    }
  };

  activeWorker.onerror = err => {
    activeWorker = null;
    sampleBtn.disabled = false;
  };

  activeWorker.postMessage({
    geojson:   loadedGeoJSON,
    spacing:   parseFloat(spacingSlider.value),
    batchSize: CONFIG.WORKER_BATCH_SIZE
  });
});

// ── Redraw circles (called when radius slider changes after sampling) ──
function redrawCircles() {
  if (circlesLayer) { map.removeLayer(circlesLayer); circlesLayer = null; }
  if (!sampledPoints.length) return;
  const r = parseInt(radiusSlider.value, 10);
  const layers = sampledPoints.map(p =>
    L.circle([p.lat, p.lng], {
      renderer:    canvasRenderer,
      radius:      r,
      color:       CONFIG.CIRCLE_COLOR,
      weight:      CONFIG.CIRCLE_WEIGHT,
      fillColor:   CONFIG.CIRCLE_FILL_COLOR,
      fillOpacity: CONFIG.CIRCLE_FILL_OPACITY,
      dashArray:   CONFIG.CIRCLE_DASH
    })
  );
  circlesLayer = L.layerGroup(layers).addTo(map);
}

// ── Export ─────────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  const csv = sampledPoints.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('\n');
  navigator.clipboard.writeText(csv).then(() => {
    const t = copyBtn.textContent;
    copyBtn.textContent = 'Copied ✓';
    setTimeout(() => copyBtn.textContent = t, CONFIG.COPY_FEEDBACK_MS);
  });
});

dlBtn.addEventListener('click', () => {
  const csv = 'latitude,longitude\n' + sampledPoints.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('\n');
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), {
    href: blobUrl,
    download: 'sample_coords.csv'
  });
  a.click();
  URL.revokeObjectURL(blobUrl);
});

// ── Helpers ────────────────────────────────────────────────
function clearAllLayers() {
  [geojsonLayer, pointsLayer, circlesLayer].forEach(l => l && map.removeLayer(l));
  geojsonLayer = pointsLayer = circlesLayer = null;
  // Recreate the canvas renderer to drop any stale canvas elements from the previous session
  canvasRenderer.remove();
  canvasRenderer = L.canvas({ padding: CONFIG.CANVAS_PADDING });
}

function clearPointLayers() {
  [pointsLayer, circlesLayer].forEach(l => l && map.removeLayer(l));
  pointsLayer = circlesLayer = null;
}

function resetStepIndicators() {
  ['step1-num', 'step2-num', 'step3-num'].forEach(id => $(id).classList.remove('active'));
}

function activeInputEl() {
  return $('pane-upload').style.display !== 'none' ? dropZone : geojsonInput;
}

function showError(msg) {
  activeInputEl().classList.add('error');
  geojsonError.textContent = msg;
  geojsonError.classList.add('show');
}

function clearError() {
  activeInputEl().classList.remove('error');
  geojsonError.classList.remove('show');
}

