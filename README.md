# Bremerton Ready — v1.5.0 fallback-ready

Static street-familiarization site for City of Bremerton personnel.

## Resilient data behavior

1. The app first attempts the live City of Bremerton FeatureServers.
2. If **either** live service fails or times out, both City datasets switch to local GeoJSON snapshots in `/data`.
3. If live GIS is restored, the next page load automatically returns to live data.
4. The map context/basemap remains optional and independent from the street-training data.

The study-area line shows `Live GIS` or `Cached GIS` so testers can tell which source is active.

## Required cached files

```text
data/
├── streets.geojson
├── council-districts.geojson
└── backup-meta.json          optional but recommended
```

See `data/README.md` for the required fields and ArcGIS Pro export settings.

## Updating the cache

### ArcGIS Pro

Use **Features To JSON** with:

- Output to GeoJSON: checked
- Project to WGS84: checked
- Use field aliases: unchecked
- Formatted JSON: unchecked

### Automatic refresh after public services recover

On Windows with Python installed, run:

`tools/refresh-fallback.bat`

It pages through the public FeatureServers and rebuilds the two GeoJSON files plus snapshot metadata.

## Project structure

```text
bremerton-ready-v1.5.0/
├── index.html
├── styles.css
├── config.js
├── app.js
├── data/
│   ├── README.md
│   └── backup-meta.example.json
├── tools/
│   ├── refresh-fallback.py
│   └── refresh-fallback.bat
├── start-local.bat
└── README.md
```

The two actual `.geojson` snapshots are intentionally not included in this fallback-ready package because they require geometry from the authoritative GIS source.

## Live service URLs

Streets:

`https://imagegis.bremertonwa.gov/arcgis/rest/services/Hosted/Transportation_WFL1/FeatureServer/40`

Council districts:

`https://imagegis.bremertonwa.gov/arcgis/rest/services/Hosted/Council_Districts_2020/FeatureServer/2`


## v1.5.2 cached-click fix
Cached GeoJSON layers now request click attributes explicitly and resolve thin hit-test graphics by object ID. This fixes Explore and Find This Street reporting every cached road as unnamed.
