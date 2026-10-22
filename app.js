// Bremerton Ready v1.5.1 application bootstrap.
// Intentionally loaded as a classic script so local test servers with incorrect
// JavaScript MIME mappings do not trigger strict ES-module MIME blocking.
(async () => {
const CONFIG = window.BREMERTON_READY_CONFIG;
if (!CONFIG) {
  throw new Error("Bremerton Ready configuration did not load.");
}

const waitForArcGIS = async () => {
  const started = Date.now();
  while (!window.$arcgis) {
    if (Date.now() - started > 15000) throw new Error("ArcGIS Maps SDK failed to load.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

await waitForArcGIS();

const [EsriMap, MapView, FeatureLayer, GeoJSONLayer, GraphicsLayer, Graphic, VectorTileLayer] = await $arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/layers/FeatureLayer.js",
  "@arcgis/core/layers/GeoJSONLayer.js",
  "@arcgis/core/layers/GraphicsLayer.js",
  "@arcgis/core/Graphic.js",
  "@arcgis/core/layers/VectorTileLayer.js"
]);

const F = CONFIG.fields;
const C = CONFIG.map.colors;
const excludedQuizNames = new Set(CONFIG.excludedQuizNames.map((name) => normalizeKey(name)));

const els = {
  appName: document.querySelector("#appName"),
  appSubtitle: document.querySelector("#appSubtitle"),
  brandLogo: document.querySelector("#brandLogo"),
  brandFallback: document.querySelector("#brandFallback"),
  departmentName: document.querySelector("#departmentName"),
  modeTabs: [...document.querySelectorAll(".mode-tab")],
  studyArea: document.querySelector("#studyArea"),
  difficulty: document.querySelector("#difficulty"),
  poolCount: document.querySelector("#poolCount"),
  resetViewButton: document.querySelector("#resetViewButton"),
  explorePanel: document.querySelector("#explorePanel"),
  quizPanel: document.querySelector("#quizPanel"),
  streetSearch: document.querySelector("#streetSearch"),
  streetOptions: document.querySelector("#streetOptions"),
  streetSearchButton: document.querySelector("#streetSearchButton"),
  streetInfo: document.querySelector("#streetInfo"),
  quizModeEyebrow: document.querySelector("#quizModeEyebrow"),
  quizPrompt: document.querySelector("#quizPrompt"),
  quizInstruction: document.querySelector("#quizInstruction"),
  multipleChoice: document.querySelector("#multipleChoice"),
  typedAnswerWrap: document.querySelector("#typedAnswerWrap"),
  typedAnswer: document.querySelector("#typedAnswer"),
  checkAnswerButton: document.querySelector("#checkAnswerButton"),
  feedback: document.querySelector("#feedback"),
  newQuestionButton: document.querySelector("#newQuestionButton"),
  revealButton: document.querySelector("#revealButton"),
  loadingBanner: document.querySelector("#loadingBanner"),
  mapHint: document.querySelector("#mapHint"),
  contextToggle: document.querySelector("#contextToggle"),
  contextStatus: document.querySelector("#contextStatus"),
  contextAttribution: document.querySelector("#contextAttribution"),
  streakBar: document.querySelector(".streak-bar"),
  streakFlame: document.querySelector("#streakFlame"),
  currentStreak: document.querySelector("#currentStreak"),
  bestStreak: document.querySelector("#bestStreak")
};

els.appName.textContent = CONFIG.appName;
els.appSubtitle.textContent = CONFIG.subtitle;
if (els.departmentName && CONFIG.branding?.departmentName) {
  els.departmentName.textContent = CONFIG.branding.departmentName;
}
if (els.brandLogo && CONFIG.branding?.logoUrl) {
  els.brandLogo.src = CONFIG.branding.logoUrl;
  els.brandLogo.addEventListener("load", () => {
    els.brandLogo.hidden = false;
    if (els.brandFallback) els.brandFallback.hidden = true;
  });
  els.brandLogo.addEventListener("error", () => {
    els.brandLogo.hidden = true;
    if (els.brandFallback) els.brandFallback.hidden = false;
  });
}
els.studyArea.value = CONFIG.defaults.studyArea;
els.difficulty.value = CONFIG.defaults.difficulty;

const state = {
  mode: CONFIG.defaults.mode,
  studyArea: CONFIG.defaults.studyArea,
  difficulty: CONFIG.defaults.difficulty,
  districtGeometry: null,
  streetPool: [],
  streetMeta: new Map(),
  streetNameGroups: new Map(),
  currentTarget: null,
  currentTargetFeatures: [],
  currentQuestionResolved: false,
  wrongAttempts: 0,
  currentStreak: 0,
  bestStreak: 0,
  initialExtent: null,
  initialized: false,
  contextLayer: null,
  contextReady: false,
  contextFailed: false,
  dataMode: "unknown",
  dataSnapshotDate: null
};

const STREAK_STORAGE_KEYS = {
  current: "bremertonReady.currentStreak",
  best: "bremertonReady.bestStreak"
};

function loadStreakState() {
  try {
    state.currentStreak = Math.max(0, Number.parseInt(localStorage.getItem(STREAK_STORAGE_KEYS.current) || "0", 10) || 0);
    state.bestStreak = Math.max(0, Number.parseInt(localStorage.getItem(STREAK_STORAGE_KEYS.best) || "0", 10) || 0);
    if (state.currentStreak > state.bestStreak) state.bestStreak = state.currentStreak;
  } catch (error) {
    console.warn("Bremerton Ready could not read local streak data. Streaks will work for this session only.", error);
  }
}

function saveStreakState() {
  try {
    localStorage.setItem(STREAK_STORAGE_KEYS.current, String(state.currentStreak));
    localStorage.setItem(STREAK_STORAGE_KEYS.best, String(state.bestStreak));
  } catch (error) {
    console.warn("Bremerton Ready could not save local streak data.", error);
  }
}

function renderStreak() {
  if (!els.currentStreak || !els.bestStreak || !els.streakFlame) return;

  els.currentStreak.textContent = String(state.currentStreak);
  els.bestStreak.textContent = String(state.bestStreak);

  let flames = "🔥";
  if (state.currentStreak >= 10) flames = "🔥🔥🔥";
  else if (state.currentStreak >= 5) flames = "🔥🔥";
  els.streakFlame.textContent = flames;

  if (els.streakBar) {
    els.streakBar.classList.toggle("is-warm", state.currentStreak >= 5 && state.currentStreak < 10);
    els.streakBar.classList.toggle("is-hot", state.currentStreak >= 10);
  }
}

function recordCorrectAnswer() {
  state.currentStreak += 1;
  if (state.currentStreak > state.bestStreak) state.bestStreak = state.currentStreak;
  saveStreakState();
  renderStreak();
}

function breakStreak() {
  if (state.currentStreak === 0) return;
  state.currentStreak = 0;
  saveStreakState();
  renderStreak();
}

loadStreakState();
renderStreak();

const eligibleWhere = `${F.fullName} IS NOT NULL`;
const cachedCitywideWhere = `${F.cachedCitywide} = 1`;
const contextConfig = CONFIG.contextBasemap || {};

let streetLayer = null;
let streetLabelLayer = null;
let districtLayer = null;

const streetRenderer = {
  type: "simple",
  symbol: {
    type: "simple-line",
    color: C.streets,
    width: 1.7,
    cap: "round",
    join: "round"
  }
};

const streetLabelingInfo = [{
  labelExpressionInfo: { expression: `$feature.${F.fullName}` },
  labelPlacement: "center-along",
  repeatLabel: false,
  symbol: {
    type: "text",
    color: "#4b5c66",
    haloColor: "#ffffff",
    haloSize: 1.2,
    font: {
      family: "Arial",
      size: 8.5,
      weight: "normal"
    }
  }
}];

const invisibleStreetRenderer = {
  type: "simple",
  symbol: {
    type: "simple-line",
    color: [0, 0, 0, 0],
    width: 0.1
  }
};

const districtRenderer = {
  type: "simple",
  symbol: {
    type: "simple-fill",
    color: [255, 255, 255, 0],
    outline: {
      color: C.districtOutline,
      width: 1.2,
      style: "dash"
    }
  }
};

function createLiveDataLayers() {
  return {
    streets: new FeatureLayer({
      url: CONFIG.services.streets,
      title: "Bremerton Streets",
      outFields: [
        F.streetOid, F.fullName, F.streetName, F.streetType, F.prefix, F.suffix,
        F.fromStreet, F.toStreet, F.shapeLength
      ],
      popupEnabled: false,
      renderer: streetRenderer
    }),
    labels: new FeatureLayer({
      url: CONFIG.services.streets,
      title: "Street Labels",
      definitionExpression: eligibleWhere,
      popupEnabled: false,
      minScale: 22000,
      renderer: invisibleStreetRenderer,
      labelingInfo: streetLabelingInfo
    }),
    districts: new FeatureLayer({
      url: CONFIG.services.districts,
      title: "Council Districts",
      outFields: [F.councilDistrict],
      popupEnabled: false,
      renderer: districtRenderer
    })
  };
}

function createFallbackDataLayers() {
  const fallback = CONFIG.fallbackData || {};
  return {
    streets: new GeoJSONLayer({
      url: fallback.streetsUrl,
      title: "Bremerton Streets — Cached",
      geometryType: "polyline",
      definitionExpression: cachedCitywideWhere,
      outFields: [
        F.streetOid, F.fullName, F.streetName, F.streetType, F.prefix, F.suffix,
        F.fromStreet, F.toStreet, F.shapeLength, F.cachedCitywide
      ],
      popupEnabled: false,
      renderer: streetRenderer
    }),
    labels: new GeoJSONLayer({
      url: fallback.streetsUrl,
      title: "Street Labels — Cached",
      geometryType: "polyline",
      definitionExpression: cachedCitywideWhere,
      outFields: [F.fullName],
      popupEnabled: false,
      minScale: 22000,
      renderer: invisibleStreetRenderer,
      labelingInfo: streetLabelingInfo
    }),
    districts: new GeoJSONLayer({
      url: fallback.districtsUrl,
      title: "Council Districts — Cached",
      geometryType: "polygon",
      outFields: [F.councilDistrict],
      popupEnabled: false,
      renderer: districtRenderer
    })
  };
}

const districtHighlightLayer = new GraphicsLayer({ title: "Selected Study Area" });
const streetHighlightLayer = new GraphicsLayer({ title: "Street Highlight" });
const feedbackHighlightLayer = new GraphicsLayer({ title: "Quiz Feedback" });

// Optional label-free context is an ordinary operational layer at index 0.
// This is more deterministic than swapping a Basemap object into an already-running View.
// Esri's Light Gray Canvas Base item itself carries the cartography; its separate
// Reference layer (labels) is intentionally never loaded.
const contextLayer = (contextConfig.enabled && contextConfig.portalItemId)
  ? new VectorTileLayer({
      portalItem: { id: contextConfig.portalItemId },
      title: "Light Gray Canvas Base — No Labels",
      opacity: Number(contextConfig.opacity) || 1,
      visible: contextConfig.defaultVisible !== false
    })
  : null;

const operationalLayers = [
  ...(contextLayer ? [contextLayer] : []),
  districtHighlightLayer,
  streetHighlightLayer,
  feedbackHighlightLayer
];

const map = new EsriMap({
  basemap: null,
  layers: operationalLayers
});

const view = new MapView({
  container: "viewDiv",
  map,
  center: CONFIG.map.center,
  zoom: CONFIG.map.zoom,
  background: { color: CONFIG.map.colors.background },
  constraints: {
    snapToZoom: false,
    minZoom: 10,
    maxZoom: 19
  },
  // ArcGIS Maps SDK 5.x: attribution is part of the View itself, not a UI component.
  // Keep only the built-in zoom control in DefaultUI.
  ui: {
    components: ["zoom"]
  },
  attributionVisible: true
});

view.popupEnabled = false;

wireEvents();
initialize().catch((error) => showFatalError(error));

async function initialize() {
  setLoading("Connecting to Bremerton GIS…");
  await view.when();

  const dataBundle = await resolveCityDataLayers();
  streetLayer = dataBundle.streets;
  streetLabelLayer = dataBundle.labels;
  districtLayer = dataBundle.districts;

  // Keep City data below quiz/highlight graphics and above the optional context layer.
  const insertionIndex = contextLayer ? 1 : 0;
  map.addMany([districtLayer, streetLayer, streetLabelLayer], insertionIndex);

  const extentResult = await streetLayer.queryExtent({ where: activeStreetWhere() });
  if (extentResult.extent) {
    state.initialExtent = extentResult.extent.expand(1.05);
    await view.goTo(state.initialExtent, { animate: false });
  }

  await updateStudyArea({ zoom: false });
  setMode(CONFIG.defaults.mode);
  state.initialized = true;
  setLoading(null);

  // The optional context basemap is intentionally non-blocking. Core street
  // training is ready before this starts, and any failure simply leaves the
  // background blank.
  initializeContextBasemap();
}

async function resolveCityDataLayers() {
  const fallback = CONFIG.fallbackData || {};
  const liveTimeout = Number(fallback.liveLoadTimeoutMs) || 8000;
  const forcedCached = requestedDataMode() === "cached";

  if (!forcedCached) {
    const live = createLiveDataLayers();
    try {
      await loadDataBundle(live, liveTimeout, "Live City GIS timed out.");
      state.dataMode = "live";
      state.dataSnapshotDate = null;
      console.info("Bremerton Ready data source: live City GIS.");
      return live;
    } catch (liveError) {
      destroyDataBundle(live);
      console.warn("Live City GIS unavailable. Attempting cached GeoJSON backup.", liveError);
    }
  } else {
    console.info("Bremerton Ready data source: cached GeoJSON forced by ?data=cached for testing.");
  }

  if (!fallback.enabled || !fallback.streetsUrl || !fallback.districtsUrl) {
    throw new Error("Live City GIS is unavailable and cached backup data is disabled.");
  }

  setLoading(forcedCached ? "Loading cached GIS test…" : "City GIS unavailable — loading cached backup…");
  const cached = createFallbackDataLayers();
  try {
    const cachedTimeout = Number(fallback.fallbackLoadTimeoutMs) || 12000;
    await loadDataBundle(cached, cachedTimeout, "Cached GeoJSON data timed out.");
    state.dataMode = "cached";
    state.dataSnapshotDate = await loadFallbackMetadataDate();
    console.warn("Bremerton Ready data source: cached GeoJSON backup.", {
      snapshotDate: state.dataSnapshotDate || "unknown",
      forcedForTesting: forcedCached
    });
    return cached;
  } catch (cachedError) {
    destroyDataBundle(cached);
    throw new AggregateError(
      [cachedError],
      "Live City GIS is unavailable and the cached GeoJSON backup could not be loaded."
    );
  }
}

function requestedDataMode() {
  const parameter = CONFIG.fallbackData?.testQueryParameter || "data";
  return new URLSearchParams(window.location.search).get(parameter)?.trim().toLowerCase() || "";
}

function activeStreetWhere() {
  return state.dataMode === "cached" ? cachedCitywideWhere : eligibleWhere;
}

async function loadDataBundle(bundle, timeoutMs, timeoutMessage) {
  await promiseWithTimeout(
    Promise.all([bundle.streets.load(), bundle.labels.load(), bundle.districts.load()]),
    timeoutMs,
    timeoutMessage
  );
}

function destroyDataBundle(bundle) {
  for (const layer of Object.values(bundle || {})) {
    try { layer?.destroy?.(); } catch (_) { /* no-op */ }
  }
}

async function loadFallbackMetadataDate() {
  const url = CONFIG.fallbackData?.metadataUrl;
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const metadata = await response.json();
    return metadata.generatedDate || metadata.generatedUtc || null;
  } catch (_) {
    return null;
  }
}

function wireEvents() {
  els.modeTabs.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  els.studyArea.addEventListener("change", async () => {
    state.studyArea = els.studyArea.value;
    clearQuiz();
    await updateStudyArea({ zoom: true });
  });

  els.difficulty.addEventListener("change", () => {
    state.difficulty = els.difficulty.value;
    clearQuiz();
    updateModeCopy();
  });

  els.resetViewButton.addEventListener("click", () => resetMapView());
  els.contextToggle?.addEventListener("change", () => setContextVisibility(els.contextToggle.checked));
  els.streetSearchButton.addEventListener("click", () => searchStreet());
  els.streetSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchStreet();
  });

  els.newQuestionButton.addEventListener("click", () => startQuestion());
  els.revealButton.addEventListener("click", () => revealAnswer());
  els.checkAnswerButton.addEventListener("click", () => checkTypedAnswer());
  els.typedAnswer.addEventListener("keydown", (event) => {
    if (event.key === "Enter") checkTypedAnswer();
  });

  view.on("click", async (event) => {
    if (!state.initialized) return;
    if (state.mode === "explore") {
      await handleExploreClick(event);
    } else if (state.mode === "find") {
      await handleFindClick(event);
    }
  });
}

async function initializeContextBasemap() {
  if (els.contextAttribution && contextConfig.attribution) {
    els.contextAttribution.textContent = contextConfig.attribution;
  }

  if (!contextLayer || !els.contextToggle) {
    setContextControlState("unavailable");
    return;
  }

  setContextControlState("loading");

  try {
    const timeoutMs = Number(contextConfig.loadTimeoutMs) || 10000;

    await promiseWithTimeout(contextLayer.load(), timeoutMs, "Context map layer timed out.");
    const layerView = await promiseWithTimeout(
      view.whenLayerView(contextLayer),
      timeoutMs,
      "Context map layer view timed out."
    );

    state.contextLayer = contextLayer;
    state.contextReady = true;
    state.contextFailed = false;

    const shouldShow = contextConfig.defaultVisible !== false;
    els.contextToggle.checked = shouldShow;
    setContextVisibility(shouldShow);
    setContextControlState("ready");

    console.info(
      "Bremerton Ready map context initialized as the bottom operational layer.",
      {
        portalItemId: contextConfig.portalItemId,
        layerUrl: contextLayer.url || null,
        loaded: contextLayer.loaded,
        visible: contextLayer.visible,
        layerIndex: map.layers.indexOf(contextLayer),
        layerViewSuspended: layerView.suspended
      }
    );
  } catch (error) {
    console.warn(
      "Optional map context unavailable. Continuing without a background map.",
      error
    );
    contextLayer.visible = false;
    state.contextLayer = null;
    state.contextReady = false;
    state.contextFailed = true;
    setContextControlState("unavailable");
  }
}

function promiseWithTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function setContextVisibility(visible) {
  if (!state.contextLayer || !state.contextReady) {
    if (els.contextToggle) els.contextToggle.checked = false;
    if (els.contextAttribution) els.contextAttribution.hidden = true;
    return;
  }

  state.contextLayer.visible = Boolean(visible);
  if (els.contextToggle) els.contextToggle.checked = Boolean(visible);
  if (els.contextAttribution) els.contextAttribution.hidden = !visible;
  if (els.contextStatus) els.contextStatus.textContent = visible ? "On" : "Off";
}

function setContextControlState(status) {
  if (!els.contextToggle || !els.contextStatus) return;

  if (status === "loading") {
    els.contextToggle.disabled = true;
    els.contextStatus.textContent = "Loading…";
    if (els.contextAttribution) els.contextAttribution.hidden = true;
    return;
  }

  if (status === "ready") {
    els.contextToggle.disabled = false;
    els.contextStatus.textContent = els.contextToggle.checked ? "On" : "Off";
    if (els.contextAttribution) els.contextAttribution.hidden = !els.contextToggle.checked;
    return;
  }

  els.contextToggle.checked = false;
  els.contextToggle.disabled = true;
  els.contextStatus.textContent = "Unavailable";
  if (els.contextAttribution) els.contextAttribution.hidden = true;
}

function setMode(mode) {
  state.mode = mode;
  clearQuiz();
  streetHighlightLayer.removeAll();
  feedbackHighlightLayer.removeAll();

  els.modeTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
  els.explorePanel.hidden = mode !== "explore";
  els.quizPanel.hidden = mode === "explore";
  streetLabelLayer.visible = mode === "explore";
  els.difficulty.disabled = mode === "explore";

  if (mode === "explore") {
    els.mapHint.textContent = "Explore: search for a street or click a named pavement segment.";
  } else if (mode === "name") {
    els.mapHint.textContent = "Name This Street: identify the highlighted street.";
  } else {
    els.mapHint.textContent = "Find This Street: click the requested street on the map.";
  }

  updateModeCopy();
}

function updateModeCopy() {
  if (state.mode === "explore") return;

  const difficultyName = titleCase(state.difficulty);
  els.quizModeEyebrow.textContent = `${state.mode === "name" ? "Name This Street" : "Find This Street"} · ${difficultyName}`;

  if (!state.currentTarget) {
    els.quizPrompt.textContent = "Ready to practice?";
    els.quizInstruction.textContent = state.mode === "name"
      ? describeNameDifficulty()
      : describeFindDifficulty();
    els.newQuestionButton.textContent = "Start Question";
  }
}

function describeNameDifficulty() {
  if (state.difficulty === "learn") return "The full street will highlight and you will choose from four answers.";
  if (state.difficulty === "practice") return "The full street will highlight and you will type its name.";
  return "Only one strong segment will highlight. Type the street name from limited context.";
}

function describeFindDifficulty() {
  if (state.difficulty === "learn") return "Click the requested street. Incorrect clicks will tell you which street you selected.";
  if (state.difficulty === "practice") return "Click the requested street. Incorrect clicks get limited feedback.";
  return "Click the requested street with labels hidden and minimal wrong-answer feedback.";
}

async function updateStudyArea({ zoom = true } = {}) {
  setLoading("Loading study area…");
  districtHighlightLayer.removeAll();
  streetHighlightLayer.removeAll();
  feedbackHighlightLayer.removeAll();
  state.districtGeometry = null;

  if (state.studyArea !== "citywide") {
    const query = districtLayer.createQuery();
    query.outFields = [F.councilDistrict];
    query.returnGeometry = true;
    query.outSpatialReference = streetLayer.spatialReference;

    let district = null;
    if (state.dataMode === "cached") {
      // GeoJSON attribute types are inferred from the snapshot. Avoid relying on
      // SQL coercion between numeric and text council values.
      query.where = "1=1";
      const result = await districtLayer.queryFeatures(query);
      district = result.features.find((feature) =>
        String(feature.attributes?.[F.councilDistrict] ?? "") === String(state.studyArea)
      );
    } else {
      query.where = `${F.councilDistrict} = '${escapeSql(state.studyArea)}'`;
      const result = await districtLayer.queryFeatures(query);
      district = result.features[0];
    }

    if (!district) throw new Error(`Council District ${state.studyArea} was not found.`);

    state.districtGeometry = district.geometry;
    districtHighlightLayer.add(new Graphic({
      geometry: district.geometry,
      symbol: {
        type: "simple-fill",
        color: withAlpha(C.districtFill, 0.09),
        outline: { color: C.districtFill, width: 2.2 }
      }
    }));
  }

  const poolData = await getStreetPool(state.districtGeometry);
  state.streetPool = poolData.names;
  state.streetMeta = poolData.meta;
  state.streetNameGroups = buildStreetNameGroups(poolData.names, poolData.meta);
  renderStreetOptions();
  updatePoolCount();

  if (zoom) await resetMapView();
  setLoading(null);
}

async function getStreetPool(geometry) {
  const query = streetLayer.createQuery();
  query.where = activeStreetWhere();
  query.outFields = [F.fullName, F.streetName, F.streetType, F.prefix, F.suffix];
  query.returnGeometry = false;

  if (geometry) {
    query.geometry = geometry;
    query.spatialRelationship = "intersects";
  }

  // Always page the query. The pavement service currently contains more records than
  // its single-request transfer limit, and the component fields are also needed for
  // smart typed-answer validation.
  const features = await queryAllPages(streetLayer, query);
  const meta = new Map();

  for (const feature of features) {
    const attrs = feature.attributes || {};
    const fullName = cleanStreetName(attrs[F.fullName]);
    if (!isEligibleQuizName(fullName)) continue;

    if (!meta.has(fullName)) {
      meta.set(fullName, {
        fullName,
        streetName: cleanStreetName(attrs[F.streetName]),
        streetType: cleanStreetName(attrs[F.streetType]),
        prefix: cleanStreetName(attrs[F.prefix]),
        suffix: cleanStreetName(attrs[F.suffix])
      });
    }
  }

  const names = [...meta.keys()].sort((a, b) => a.localeCompare(b));
  return { names, meta };
}

function buildStreetNameGroups(names, meta) {
  const groups = new Map();

  for (const fullName of names) {
    const streetName = normalizeAnswer(meta.get(fullName)?.streetName || "");
    if (!streetName) continue;

    if (!groups.has(streetName)) groups.set(streetName, new Set());
    groups.get(streetName).add(fullName);
  }

  return groups;
}

async function queryAllPages(layer, baseQuery) {
  // Cached GeoJSON is already fully downloaded to the browser, so there is no
  // ArcGIS Server transfer limit to page through.
  if (state.dataMode === "cached") {
    const result = await layer.queryFeatures(baseQuery);
    return result.features;
  }

  const all = [];
  let start = 0;
  const pageSize = CONFIG.query.pageSize;

  while (true) {
    const query = baseQuery.clone();
    query.start = start;
    query.num = pageSize;
    const result = await layer.queryFeatures(query);
    all.push(...result.features);

    if (!result.exceededTransferLimit || result.features.length === 0) break;
    start += result.features.length;
  }

  return all;
}

function renderStreetOptions() {
  els.streetOptions.innerHTML = "";
  const fragment = document.createDocumentFragment();
  state.streetPool.forEach((name) => {
    const option = document.createElement("option");
    option.value = displayStreetName(name);
    fragment.appendChild(option);
  });
  els.streetOptions.appendChild(fragment);
}

function updatePoolCount() {
  const areaLabel = state.studyArea === "citywide" ? "Citywide" : `District ${state.studyArea}`;
  let sourceLabel = "Live GIS";
  if (state.dataMode === "cached") {
    const date = formatSnapshotDate(state.dataSnapshotDate);
    sourceLabel = date ? `Cached GIS · ${date}` : "Cached GIS";
  }
  els.poolCount.textContent = `${areaLabel}: ${state.streetPool.length.toLocaleString()} quiz streets · ${sourceLabel}`;
}

function formatSnapshotDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function resetMapView() {
  if (state.districtGeometry) {
    await view.goTo(state.districtGeometry.extent.expand(1.08), { duration: 500 });
  } else if (state.initialExtent) {
    await view.goTo(state.initialExtent, { duration: 500 });
  }
}

async function searchStreet() {
  const raw = els.streetSearch.value.trim();
  if (!raw) return;

  const target = resolvePoolStreet(raw);
  if (!target) {
    setStreetInfo("Street not found", "Try another spelling or change the study area.", true);
    return;
  }

  const features = await queryStreetFeatures(target, state.districtGeometry);
  if (!features.length) {
    setStreetInfo("Street not found", "No matching geometry was returned in the selected study area.", true);
    return;
  }

  renderStreetHighlight(features, "highlight");
  const first = features[0];
  setStreetInfo(
    displayStreetName(target),
    segmentDescription(first.attributes),
    false
  );
  await zoomToFeatures(features, 1.35);
}

async function resolveStreetHitAttributes(graphic) {
  const attrs = graphic?.attributes || {};
  if (cleanStreetName(attrs[F.fullName])) return attrs;

  // GeoJSONLayer hit-test graphics can be intentionally thin and may only
  // contain the generated/object ID even though queryFeatures has all fields.
  // Resolve the complete source feature by its object ID when needed.
  const objectIdField = streetLayer?.objectIdField || F.streetOid;
  const objectId = graphic?.getAttribute?.(objectIdField) ?? attrs[objectIdField] ?? attrs[F.streetOid];
  if (objectId == null) return attrs;

  try {
    const query = streetLayer.createQuery();
    query.objectIds = [objectId];
    query.outFields = [
      F.streetOid, F.fullName, F.streetName, F.streetType, F.prefix, F.suffix,
      F.fromStreet, F.toStreet, F.shapeLength, F.cachedCitywide
    ];
    query.returnGeometry = false;
    const result = await streetLayer.queryFeatures(query);
    return result.features[0]?.attributes || attrs;
  } catch (error) {
    console.warn("Could not resolve clicked street attributes from cached GIS.", error);
    return attrs;
  }
}

async function handleExploreClick(event) {
  const hit = await view.hitTest(event, { include: [streetLayer] });
  const result = hit.results.find((item) => item.graphic?.layer === streetLayer);
  if (!result) return;

  const attrs = await resolveStreetHitAttributes(result.graphic);
  const name = cleanStreetName(attrs?.[F.fullName]);
  if (!name) {
    setStreetInfo("Unnamed pavement segment", "This feature is not included in quiz questions yet.", true);
    return;
  }

  const features = await queryStreetFeatures(name, state.districtGeometry);
  renderStreetHighlight(features, "highlight");
  setStreetInfo(displayStreetName(name), segmentDescription(attrs), false);
}

function setStreetInfo(title, detail, isMuted) {
  els.streetInfo.classList.toggle("empty-state", Boolean(isMuted));
  els.streetInfo.innerHTML = "";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  els.streetInfo.append(strong, span);
}

function segmentDescription(attrs) {
  const from = cleanStreetName(attrs[F.fromStreet]);
  const to = cleanStreetName(attrs[F.toStreet]);
  if (from && to) return `Selected segment: ${displayStreetName(from)} → ${displayStreetName(to)}`;
  if (from) return `Selected segment from ${displayStreetName(from)}`;
  if (to) return `Selected segment to ${displayStreetName(to)}`;
  return "Named street in the selected study area.";
}

async function startQuestion() {
  if (!state.streetPool.length) return;

  clearQuiz({ keepPrompt: true });
  state.currentTarget = randomDifferentStreet(state.currentTarget);
  state.currentQuestionResolved = false;
  state.wrongAttempts = 0;
  els.newQuestionButton.hidden = true;
  els.revealButton.hidden = false;
  els.feedback.textContent = "";
  els.feedback.className = "feedback";

  if (state.mode === "name") {
    await startNameQuestion();
  } else if (state.mode === "find") {
    await startFindQuestion();
  }
}

async function startNameQuestion() {
  const features = await queryStreetFeatures(state.currentTarget, state.districtGeometry);
  state.currentTargetFeatures = features;

  if (!features.length) {
    setFeedback("That street could not be loaded. Starting another question…", "error");
    state.currentTarget = null;
    els.newQuestionButton.hidden = false;
    els.newQuestionButton.textContent = "Try Another";
    return;
  }

  els.quizPrompt.textContent = "Name the highlighted street";
  els.quizInstruction.textContent = describeNameDifficulty();

  if (state.difficulty === "challenge") {
    const best = chooseChallengeFeature(features);
    renderStreetHighlight([best], "highlight");
    await zoomToFeatures([best], 4.2);
    showTypedAnswer();
  } else {
    renderStreetHighlight(features, "highlight");
    await zoomToFeatures(features, 1.35);

    if (state.difficulty === "learn") {
      showMultipleChoice();
    } else {
      showTypedAnswer();
    }
  }
}

async function startFindQuestion() {
  state.currentTargetFeatures = await queryStreetFeatures(state.currentTarget, state.districtGeometry);
  streetHighlightLayer.removeAll();
  feedbackHighlightLayer.removeAll();
  els.multipleChoice.hidden = true;
  els.typedAnswerWrap.hidden = true;

  els.quizPrompt.textContent = `Find ${displayStreetName(state.currentTarget)}`;
  els.quizInstruction.textContent = describeFindDifficulty();
  await resetMapView();
}

function showMultipleChoice() {
  els.multipleChoice.hidden = false;
  els.typedAnswerWrap.hidden = true;
  els.multipleChoice.innerHTML = "";

  const choices = makeChoices(state.currentTarget, 4);
  choices.forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = displayStreetName(name);
    button.dataset.street = name;
    button.addEventListener("click", () => checkChoice(button, name));
    els.multipleChoice.appendChild(button);
  });
}

function showTypedAnswer() {
  els.multipleChoice.hidden = true;
  els.typedAnswerWrap.hidden = false;
  els.typedAnswer.value = "";
  setTimeout(() => els.typedAnswer.focus(), 0);
}

function checkChoice(button, choice) {
  if (!state.currentTarget || state.currentQuestionResolved) return;
  if (normalizeAnswer(choice) === normalizeAnswer(state.currentTarget)) {
    button.classList.add("is-correct");
    resolveCorrect();
  } else {
    button.classList.add("is-wrong");
    button.disabled = true;
    state.wrongAttempts += 1;
    breakStreak();
    setFeedback("Not quite. Try another choice.", "error");
  }
}

function checkTypedAnswer() {
  if (!state.currentTarget || state.currentQuestionResolved) return;
  const answer = els.typedAnswer.value.trim();
  if (!answer) return;

  const evaluation = evaluateTypedAnswer(answer, state.currentTarget);

  if (evaluation === "correct") {
    resolveCorrect();
    return;
  }

  if (evaluation === "needs-suffix") {
    setFeedback("For this street, the suffix (Ave, Dr, etc) is required.", "error");
    els.typedAnswer.select();
    return;
  }

  breakStreak();
  state.wrongAttempts += 1;
  if (state.wrongAttempts >= 2) {
    setFeedback(`Answer: ${displayStreetName(state.currentTarget)}`, "error");
    resolveQuestion(false, { reveal: true });
  } else {
    setFeedback("Not quite. Try once more.", "error");
    els.typedAnswer.select();
  }
}

function evaluateTypedAnswer(input, target) {
  const normalizedInput = normalizeAnswer(input);
  const normalizedTarget = normalizeAnswer(target);

  // The complete official street name is always accepted, with the existing
  // abbreviation/full-word normalization (AVE/Avenue, ST/Street, etc.).
  if (normalizedInput === normalizedTarget) return "correct";

  const meta = state.streetMeta.get(target);
  const baseStreetName = normalizeAnswer(meta?.streetName || "");
  if (!baseStreetName || normalizedInput !== baseStreetName) return "incorrect";

  // A bare STREETNAME is accepted only when it identifies one street in the
  // currently selected Citywide/Council District quiz pool.
  const matches = state.streetNameGroups.get(baseStreetName);
  return matches?.size === 1 ? "correct" : "needs-suffix";
}

async function handleFindClick(event) {
  if (!state.currentTarget || state.currentQuestionResolved) return;

  const hit = await view.hitTest(event, { include: [streetLayer] });
  const result = hit.results.find((item) => item.graphic?.layer === streetLayer);
  if (!result) {
    setFeedback("Click closer to a street line.", "error");
    return;
  }

  const clickedAttrs = await resolveStreetHitAttributes(result.graphic);
  const clickedName = cleanStreetName(clickedAttrs?.[F.fullName]);
  if (!clickedName) {
    setFeedback("That pavement segment does not have a street name yet.", "error");
    return;
  }

  if (normalizeAnswer(clickedName) === normalizeAnswer(state.currentTarget)) {
    resolveCorrect();
    return;
  }

  breakStreak();
  state.wrongAttempts += 1;
  const clickedFeatures = await queryStreetFeatures(clickedName, state.districtGeometry);
  renderFeedbackHighlight(clickedFeatures, "incorrect");

  if (state.difficulty === "learn") {
    setFeedback(`That's ${displayStreetName(clickedName)}. Try again.`, "error");
  } else if (state.difficulty === "practice") {
    setFeedback("Not that street. Try again.", "error");
  } else {
    setFeedback("Incorrect.", "error");
  }
}

function resolveCorrect() {
  recordCorrectAnswer();
  setFeedback(`Correct — ${displayStreetName(state.currentTarget)}`, "success");
  resolveQuestion(true, { reveal: true });
}

function resolveQuestion(isCorrect, { reveal = false } = {}) {
  state.currentQuestionResolved = true;
  els.newQuestionButton.hidden = false;
  els.newQuestionButton.textContent = "Next Street";
  els.revealButton.hidden = true;
  els.checkAnswerButton.disabled = true;

  if (reveal && state.currentTargetFeatures.length) {
    renderStreetHighlight(state.currentTargetFeatures, isCorrect ? "correct" : "highlight");
  }

  els.multipleChoice.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
    if (normalizeAnswer(button.dataset.street) === normalizeAnswer(state.currentTarget)) {
      button.classList.add("is-correct");
    }
  });
}

function revealAnswer() {
  if (!state.currentTarget) return;
  breakStreak();
  setFeedback(`Answer: ${displayStreetName(state.currentTarget)}`, "success");
  resolveQuestion(false, { reveal: true });
}

function clearQuiz({ keepPrompt = false } = {}) {
  state.currentTarget = null;
  state.currentTargetFeatures = [];
  state.currentQuestionResolved = false;
  state.wrongAttempts = 0;
  streetHighlightLayer.removeAll();
  feedbackHighlightLayer.removeAll();

  els.multipleChoice.hidden = true;
  els.multipleChoice.innerHTML = "";
  els.typedAnswerWrap.hidden = true;
  els.typedAnswer.value = "";
  els.checkAnswerButton.disabled = false;
  els.feedback.textContent = "";
  els.feedback.className = "feedback";
  els.revealButton.hidden = true;
  els.newQuestionButton.hidden = false;
  els.newQuestionButton.textContent = "Start Question";

  if (!keepPrompt) updateModeCopy();
}

async function queryStreetFeatures(streetName, geometry) {
  const query = streetLayer.createQuery();
  query.where = `${F.fullName} = '${escapeSql(streetName)}'` +
    (state.dataMode === "cached" ? ` AND ${F.cachedCitywide} = 1` : "");
  query.outFields = [
    F.streetOid,
    F.fullName,
    F.fromStreet,
    F.toStreet,
    F.shapeLength
  ];
  query.returnGeometry = true;

  if (geometry) {
    query.geometry = geometry;
    query.spatialRelationship = "intersects";
  }

  const result = await streetLayer.queryFeatures(query);
  return result.features;
}

function chooseChallengeFeature(features) {
  const sorted = [...features].sort((a, b) => {
    const aLen = Number(a.attributes?.[F.shapeLength]) || 0;
    const bLen = Number(b.attributes?.[F.shapeLength]) || 0;
    return bLen - aLen;
  });

  // Randomize among the three strongest segments so repeated questions do not feel identical.
  const finalists = sorted.slice(0, Math.min(3, sorted.length));
  return finalists[Math.floor(Math.random() * finalists.length)];
}

function renderStreetHighlight(features, kind) {
  streetHighlightLayer.removeAll();
  feedbackHighlightLayer.removeAll();
  const symbol = lineSymbol(kind);
  const graphics = features.map((feature) => new Graphic({
    geometry: feature.geometry,
    attributes: feature.attributes,
    symbol
  }));
  streetHighlightLayer.addMany(graphics);
}

function renderFeedbackHighlight(features, kind) {
  feedbackHighlightLayer.removeAll();
  const symbol = lineSymbol(kind);
  feedbackHighlightLayer.addMany(features.map((feature) => new Graphic({
    geometry: feature.geometry,
    attributes: feature.attributes,
    symbol
  })));

  setTimeout(() => feedbackHighlightLayer.removeAll(), 1300);
}

function lineSymbol(kind) {
  const color = kind === "correct" ? C.correct : kind === "incorrect" ? C.incorrect : C.highlight;
  return {
    type: "simple-line",
    color,
    width: kind === "incorrect" ? 5 : 6,
    cap: "round",
    join: "round"
  };
}

async function zoomToFeatures(features, expandFactor) {
  if (!features.length) return;
  let extent = null;
  for (const feature of features) {
    const featureExtent = feature.geometry?.extent;
    if (!featureExtent) continue;
    extent = extent ? extent.union(featureExtent) : featureExtent.clone();
  }
  if (!extent) return;
  await view.goTo(extent.expand(expandFactor), { duration: 500, maxScale: 2500 });
}

function randomDifferentStreet(previous) {
  if (state.streetPool.length === 1) return state.streetPool[0];
  let next = previous;
  while (next === previous) {
    next = state.streetPool[Math.floor(Math.random() * state.streetPool.length)];
  }
  return next;
}

function makeChoices(correct, count) {
  const others = state.streetPool.filter((name) => name !== correct);
  shuffle(others);
  return shuffle([correct, ...others.slice(0, Math.max(0, count - 1))]);
}

function resolvePoolStreet(input) {
  const normalizedInput = normalizeAnswer(input);
  let exact = state.streetPool.find((name) => normalizeAnswer(name) === normalizedInput);
  if (exact) return exact;

  const key = normalizeKey(input);
  exact = state.streetPool.find((name) => normalizeKey(displayStreetName(name)) === key || normalizeKey(name) === key);
  if (exact) return exact;

  const partials = state.streetPool.filter((name) => normalizeKey(displayStreetName(name)).includes(key));
  return partials.length === 1 ? partials[0] : null;
}

function isEligibleQuizName(name) {
  if (!name) return false;
  return !excludedQuizNames.has(normalizeKey(name));
}

function cleanStreetName(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return cleanStreetName(value).toUpperCase();
}

const ANSWER_TOKEN_MAP = new Map(Object.entries({
  "AVENUE": "AVE", "AVE.": "AVE",
  "STREET": "ST", "ST.": "ST",
  "ROAD": "RD", "RD.": "RD",
  "BOULEVARD": "BLVD", "BLVD.": "BLVD",
  "DRIVE": "DR", "DR.": "DR",
  "LANE": "LN", "LN.": "LN",
  "COURT": "CT", "CT.": "CT",
  "PLACE": "PL", "PL.": "PL",
  "CIRCLE": "CIR", "CIR.": "CIR",
  "PARKWAY": "PKWY", "PKWY.": "PKWY",
  "TRAIL": "TRL", "TRL.": "TRL",
  "HIGHWAY": "HWY", "HWY.": "HWY",
  "BRIDGE": "BRG", "BRG.": "BRG",
  "BEACH": "BCH", "BCH.": "BCH",
  "VIEW": "VW", "VW.": "VW",
  "EXTENSION": "EXT", "EXT.": "EXT",
  "COURSE": "CRSE", "CRSE.": "CRSE",
  "NORTH": "N", "N.": "N",
  "SOUTH": "S", "S.": "S",
  "EAST": "E", "E.": "E",
  "WEST": "W", "W.": "W",
  "NORTHEAST": "NE", "N.E.": "NE",
  "NORTHWEST": "NW", "N.W.": "NW",
  "SOUTHEAST": "SE", "S.E.": "SE",
  "SOUTHWEST": "SW", "S.W.": "SW"
}));

function normalizeAnswer(value) {
  const cleaned = cleanStreetName(value)
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    .split(" ")
    .map((token) => ANSWER_TOKEN_MAP.get(token) || token)
    .join(" ");
}

const DISPLAY_TOKEN_MAP = new Map(Object.entries({
  "AVE": "Avenue",
  "ST": "Street",
  "RD": "Road",
  "BLVD": "Boulevard",
  "DR": "Drive",
  "LN": "Lane",
  "CT": "Court",
  "PL": "Place",
  "CIR": "Circle",
  "PKWY": "Parkway",
  "TRL": "Trail",
  "HWY": "Highway",
  "BRG": "Bridge",
  "BCH": "Beach",
  "VW": "View",
  "EXT": "Extension",
  "CRSE": "Course"
}));

const DIRECTION_TOKENS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

function displayStreetName(value) {
  return cleanStreetName(value)
    .toUpperCase()
    .split(" ")
    .map((token) => {
      if (DIRECTION_TOKENS.has(token)) return token;
      if (DISPLAY_TOKEN_MAP.has(token)) return DISPLAY_TOKEN_MAP.get(token);
      if (/^\d+(ST|ND|RD|TH)$/.test(token)) return token.toLowerCase().replace(/^./, (c) => c.toUpperCase());
      if (/^\d+$/.test(token)) return token;
      return token.toLowerCase().replace(/(^|['-])[a-z]/g, (letter) => letter.toUpperCase());
    })
    .join(" ");
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function titleCase(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function withAlpha(hex, alpha) {
  const cleaned = hex.replace("#", "");
  const int = Number.parseInt(cleaned, 16);
  return [
    (int >> 16) & 255,
    (int >> 8) & 255,
    int & 255,
    alpha
  ];
}

function setFeedback(message, type = "") {
  els.feedback.textContent = message;
  els.feedback.className = `feedback${type ? ` ${type}` : ""}`;
}

function setLoading(message) {
  if (!message) {
    els.loadingBanner.hidden = true;
    els.loadingBanner.classList.remove("is-error");
    return;
  }
  els.loadingBanner.hidden = false;
  els.loadingBanner.textContent = message;
  els.loadingBanner.classList.remove("is-error");
}

function showFatalError(error) {
  console.error(error);
  els.loadingBanner.hidden = false;
  els.loadingBanner.classList.add("is-error");
  els.loadingBanner.textContent = "Bremerton Ready could not load City GIS or the cached backup.";
  els.poolCount.textContent = "Data unavailable";
}

})().catch((error) => {
  console.error("Bremerton Ready startup failed.", error);
  const banner = document.querySelector("#loadingBanner");
  if (banner) {
    banner.hidden = false;
    banner.classList.add("is-error");
    banner.textContent = "Bremerton Ready could not load City GIS or the cached backup.";
  }
});
