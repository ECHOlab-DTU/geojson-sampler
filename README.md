# GeoJSON Sampler

Upload a GeoJSON polygon, sample a grid of coordinates within it, and export them as CSV for use with the [Google Maps Nearby Search API](https://developers.google.com/maps/documentation/places/web-service/nearby-search).

## Usage

1. Upload a `.geojson` or `.json` file (or paste GeoJSON directly)
2. Adjust grid spacing and search radius
3. Click **Sample Coordinates**
4. Export via **Copy CSV** or **Download**

The exported CSV (`latitude,longitude`) can be fed directly into Nearby Search requests to retrieve place IDs across the polygon area.

## Hosted

[echolab-dtu.github.io/geojson-sampler](https://echolab-dtu.github.io/geojson-sampler)

## Built by

[EchoLab — The Observatory for Human Centered Engineering](https://echolab-dtu.github.io/web/)
