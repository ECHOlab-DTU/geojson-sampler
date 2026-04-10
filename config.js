const CONFIG = Object.freeze({
  // Grid / sampling
  SPACING_DEFAULT_KM:       1.5,
  SPACING_MIN_KM:           0.2,
  SPACING_MAX_KM:           10.0,
  SPACING_STEP_KM:          0.1,

  RADIUS_DEFAULT_M:         1000,
  RADIUS_MIN_M:             100,
  RADIUS_MAX_M:             5000,
  RADIUS_STEP_M:            100,

  // UX: show confirm dialog above this many estimated points
  POINT_CAP:                5000,

  // Cost estimate
  COST_PER_CALL:            0.032,   // $ per Nearby Search Basic call

  // Worker streaming
  WORKER_BATCH_SIZE:        100,

  // Turf CDN (used inside the worker blob string)
  TURF_CDN_URL:             new URL('vendor/turf.min.js', document.baseURI).href,
  // ^ resolves to an absolute URL so the blob worker can fetch it regardless of context

  // Leaflet canvas renderer
  CANVAS_PADDING:           0.5,

  // Map
  MAP_DEFAULT_VIEW:         [20, 0],
  MAP_DEFAULT_ZOOM:         2,
  MAP_FIT_PADDING:          [30, 30],

  // GeoJSON layer style
  GEOJSON_COLOR:            '#0d1b4b',
  GEOJSON_WEIGHT:           2,
  GEOJSON_FILL_COLOR:       '#1a3070',
  GEOJSON_FILL_OPACITY:     0.08,
  GEOJSON_DASH:             '4 3',

  // Point marker style
  POINT_RADIUS:             4,
  POINT_COLOR:              '#fff',
  POINT_WEIGHT:             1.5,
  POINT_FILL_COLOR:         '#0d1b4b',
  POINT_FILL_OPACITY:       0.9,

  // Search radius circle style
  CIRCLE_COLOR:             '#0d1b4b',
  CIRCLE_WEIGHT:            1,
  CIRCLE_FILL_COLOR:        '#1a3070',
  CIRCLE_FILL_OPACITY:      0.05,
  CIRCLE_DASH:              '3 4',

  // Copy button feedback duration (ms)
  COPY_FEEDBACK_MS:         1500,
});
