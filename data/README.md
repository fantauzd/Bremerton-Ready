# Bremerton Ready cached GIS snapshot

These GeoJSON files are a same-origin emergency fallback for Bremerton Ready.

## `streets.geojson`

This is a normalized training snapshot created from the more complete City street layer supplied for Bremerton Ready.

Required properties used by the app:

- `objectid_1`
- `full_name`
- `streetname`
- `streettype`
- `prefix`
- `suffix`
- `from_`
- `to_`
- `shape_leng`
- `br_citywide`

Additional retained property:

- `hierarchy` — retained for possible future Mutual Aid / major-corridor study logic.

### `br_citywide`

`1` means the segment intersects at least one Council District 1–7 polygon and is eligible for normal cached Citywide/district study.

`0` means the segment is outside the normal Bremerton study footprint. These mutual-aid/outside roads stay packaged but are excluded from normal cached study.

## `council-districts.geojson`

Required property:

- `council` (1–7)

## Updating the snapshot later

Because the fallback streets intentionally come from a different, more complete source than the public Pavement - All service, do not overwrite this file with a direct public-service export without rebuilding the `br_citywide` flag and normalizing the street fields.
