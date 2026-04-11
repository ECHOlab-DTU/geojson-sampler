// ── Drawing feature ────────────────────────────────────────
// Adds a "Draw" tab that lets the user sketch a Polygon or Rectangle
// directly on the map.  On completion the shape is converted to a
// GeoJSON FeatureCollection and passed to the existing loadGeoJSON().

(function () {
  const $ = id => document.getElementById(id);

  // Layer that holds the in-progress / completed drawn shape
  let drawnItems = new L.FeatureGroup().addTo(map);

  // Currently active Leaflet.draw handler (or null)
  let activeHandler = null;

  // ── Tab wiring ─────────────────────────────────────────────
  const tabBtns = ['tab-upload', 'tab-paste', 'tab-draw'];
  const panes   = { 'tab-upload': 'pane-upload', 'tab-paste': 'pane-paste', 'tab-draw': 'pane-draw' };

  function setActiveTab(id) {
    const leavingDraw  = $('tab-draw').classList.contains('active') && id !== 'tab-draw';
    const enteringDraw = id === 'tab-draw';

    // Warn before clearing if there is something to lose
    if (leavingDraw && drawnItems.getLayers().length > 0) {
      if (!confirm('Switching tabs will clear your drawn shapes. Continue?')) return;
    }
    if (enteringDraw && loadedGeoJSON) {
      if (!confirm('Switching to Draw will clear the loaded GeoJSON. Continue?')) return;
    }

    tabBtns.forEach(t => {
      $(t).classList.toggle('active', t === id);
    });
    Object.entries(panes).forEach(([tab, pane]) => {
      $(pane).style.display = tab === id ? '' : 'none';
    });
    $('load-btn').style.display = id === 'tab-paste' ? '' : 'none';

    if (leavingDraw) {
      stopDrawing();
      drawnItems.clearLayers();
      clearPointLayers();
      loadedGeoJSON = null;
      sampleBtn.disabled = true;
      resetStepIndicators();
      statPoints.textContent = '—';
      statArea.textContent   = '—';
      infoBox.classList.remove('show');
    }

    if (enteringDraw) {
      clearAllLayers();
      loadedGeoJSON = null;
      sampleBtn.disabled = true;
      resetStepIndicators();
      statPoints.textContent = '—';
      statArea.textContent   = '—';
      infoBox.classList.remove('show');
    }
  }

  // Re-wire the existing upload / paste tab buttons to use our helper
  $('tab-upload').addEventListener('click', () => {
    setActiveTab('tab-upload');
    clearError();
  });
  $('tab-paste').addEventListener('click', () => {
    setActiveTab('tab-paste');
    clearError();
  });
  $('tab-draw').addEventListener('click', () => {
    setActiveTab('tab-draw');
    clearError();
  });

  // ── Draw toolbar buttons ───────────────────────────────────
  $('draw-polygon-btn').addEventListener('click', () => startDrawing('polygon'));
  $('draw-rect-btn').addEventListener('click',    () => startDrawing('rectangle'));
  $('draw-clear-btn').addEventListener('click',   () => {
    drawnItems.clearLayers();
    syncShapes();
  });

  function setHint(msg) {
    $('draw-hint').textContent = msg;
  }

  function setToolActive(id) {
    ['draw-polygon-btn', 'draw-rect-btn'].forEach(b => {
      $(b).classList.toggle('draw-tool-btn--active', b === id);
    });
  }

  // ── Start / stop drawing ───────────────────────────────────
  function startDrawing(type) {
    stopDrawing();

    const shapeOptions = {
      color:       CONFIG.GEOJSON_COLOR,
      weight:      CONFIG.GEOJSON_WEIGHT,
      fillColor:   CONFIG.GEOJSON_FILL_COLOR,
      fillOpacity: CONFIG.GEOJSON_FILL_OPACITY,
      dashArray:   CONFIG.GEOJSON_DASH,
    };

    if (type === 'polygon') {
      activeHandler = new L.Draw.Polygon(map, {
        shapeOptions,
        showArea: false,
        allowIntersection: false,
      });
      setHint('Click to add vertices — double-click to finish');
      setToolActive('draw-polygon-btn');
    } else {
      activeHandler = new L.Draw.Rectangle(map, { shapeOptions });
      setHint('Click and drag to draw a rectangle');
      setToolActive('draw-rect-btn');
    }

    activeHandler.enable();
  }

  function stopDrawing() {
    if (activeHandler) {
      activeHandler.disable();
      activeHandler = null;
    }
    setToolActive(null);
  }

  // ── Sync all drawn shapes into loadGeoJSON ─────────────────
  function syncShapes(fitBounds) {
    const layers = drawnItems.getLayers();
    if (layers.length === 0) {
      clearPointLayers();
      loadedGeoJSON = null;
      sampleBtn.disabled = true;
      resetStepIndicators();
      $('stat-area').textContent = '—';
      $('draw-clear-btn').disabled = true;
      setHint('Select a tool, then draw on the map');
      return;
    }
    $('draw-clear-btn').disabled = false;
    const features = layers.map(l => l.toGeoJSON());
    const fc = { type: 'FeatureCollection', features };
    const count = features.length;
    setHint(count === 1
      ? 'Shape ready — draw more or sample'
      : `${count} shapes ready — draw more or sample`);
    if (fitBounds) map.fitBounds(drawnItems.getBounds(), { padding: CONFIG.MAP_FIT_PADDING });
    loadGeoJSON(fc, true);
  }

  // ── Per-layer popup with Remove action ────────────────────
  function bindLayerPopup(layer) {
    layer.on('click', function (e) {
      if (activeHandler) return;

      L.popup({ closeButton: false, className: 'shape-popup' })
        .setLatLng(e.latlng)
        .setContent(
          '<div class="shape-popup-btns">' +
            '<button class="shape-popup-btn shape-popup-btn--danger" id="popup-remove">Remove shape</button>' +
          '</div>'
        )
        .openOn(map);

      setTimeout(() => {
        const removeBtn = document.getElementById('popup-remove');
        if (!removeBtn) return;
        removeBtn.addEventListener('click', () => {
          map.closePopup();
          drawnItems.removeLayer(layer);
          syncShapes();
        });
      }, 0);
    });
  }

  // ── Handle completed shape ─────────────────────────────────
  map.on(L.Draw.Event.CREATED, function (e) {
    activeHandler = null;
    setToolActive(null);

    const isFirst = drawnItems.getLayers().length === 0;
    bindLayerPopup(e.layer);
    drawnItems.addLayer(e.layer);
    syncShapes(isFirst);
  });

  // If the user cancels drawing (e.g. Escape key), reset the hint
  map.on(L.Draw.Event.DRAWSTOP, function () {
    if (drawnItems.getLayers().length === 0) {
      setHint('Select a tool, then draw on the map');
      setToolActive(null);
    }
  });
})();
