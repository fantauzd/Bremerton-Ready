window.BREMERTON_READY_CONFIG = Object.freeze({
  appName: "Bremerton Ready",
  subtitle: "Street Familiarization",

  branding: {
    departmentName: "Bremerton Fire Department",
    // Current badge image used by the Kitsap County EMS member-agency page.
    // For permanent City hosting, this can be replaced with a City-hosted or local image path.
    logoUrl: "https://www.kitsapcountyems.org/wp-content/uploads/2020/11/BFD-Fire-Patch-002-300x233.jpg"
  },

  services: {
    streets: "https://imagegis.bremertonwa.gov/arcgis/rest/services/Hosted/Transportation_WFL1/FeatureServer/40",
    districts: "https://imagegis.bremertonwa.gov/arcgis/rest/services/Hosted/Council_Districts_2020/FeatureServer/2"
  },

  // Resilient local backup. The app always tries live City GIS first.
  // If either live service fails, both datasets switch to these same-origin
  // GeoJSON snapshots so GitHub Pages can keep operating during GIS outages.
  fallbackData: {
    enabled: true,
    streetsUrl: "./data/streets.geojson",
    districtsUrl: "./data/council-districts.geojson",
    metadataUrl: "./data/backup-meta.json",
    liveLoadTimeoutMs: 8000,
    fallbackLoadTimeoutMs: 12000,
    // Add ?data=cached to the page URL to test the packaged GeoJSON even when live GIS is healthy.
    testQueryParameter: "data"
  },

  // Optional contextual basemap. This is never required for core app operation.
  // This public portal item is Esri's Light Gray Canvas *Base* layer. Labels are
  // published separately in the Light Gray Canvas Reference layer, which we do
  // not load, so the context map stays label-free without rewriting its style.
  contextBasemap: {
    enabled: true,
    defaultVisible: true,
    portalItemId: "291da5eab3a0412593b66d384379f89f",
    opacity: 1.0,
    loadTimeoutMs: 10000,
    attribution: "Light Gray Canvas Base © Esri and contributors"
  },

  fields: {
    streetOid: "objectid_1",
    fullName: "full_name",
    streetName: "streetname",
    streetType: "streettype",
    prefix: "prefix",
    suffix: "suffix",
    fromStreet: "from_",
    toStreet: "to_",
    shapeLength: "shape_leng",
    cachedCitywide: "br_citywide",
    councilDistrict: "council"
  },

  // These records stay visible on the base street map, but are not selected as quiz questions.
  excludedQuizNames: [
    "UNNAMED",
    "TRANSIT TRAFFIC",
    "BAKER HEIGHTS LOOP"
  ],

  defaults: {
    studyArea: "citywide",
    difficulty: "learn",
    mode: "explore"
  },

  query: {
    pageSize: 1000
  },

  map: {
    center: [-122.65, 47.57],
    zoom: 12,
    colors: {
      background: "#f6f5f1",
      streets: "#9aa0a6",
      streetCasing: "#ffffff",
      districtOutline: "#5c6670",
      districtFill: "#07194f",
      highlight: "#d4a900",
      highlightHalo: "#ffffff",
      correct: "#2d7556",
      incorrect: "#a93434"
    }
  }
});
