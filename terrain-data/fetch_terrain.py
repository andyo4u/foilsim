"""
Fetch heightmap + satellite imagery for any location.
Downloads from USGS 3DEP (elevation) and ESRI World Imagery (satellite).

Usage:
  python fetch_terrain.py <name> <lat> <lon> [width_km] [height_km]

Examples:
  python fetch_terrain.py rufus 45.685 -120.758
  python fetch_terrain.py rufus 45.685 -120.758 14 11
  python fetch_terrain.py hood-river 45.71 -121.51 12 10

Output:
  <name>_heightmap_1024.png  (grayscale elevation)
  <name>_satellite_2048.jpg  (color satellite)
  Prints elevMin, elevMax, worldW, worldD for use in terrainConfigs.
"""

import sys
import math
import io
import requests
import numpy as np
from PIL import Image


def fetch_terrain(name, center_lat, center_lon, width_km=14.4, height_km=11.0):
    # Convert km to degrees
    half_lat = (height_km / 2) / 111.0
    half_lon = (width_km / 2) / (111.0 * math.cos(math.radians(center_lat)))

    west  = center_lon - half_lon
    east  = center_lon + half_lon
    south = center_lat - half_lat
    north = center_lat + half_lat

    # Actual world dimensions in meters
    world_w = (east - west) * 111000 * math.cos(math.radians(center_lat))
    world_d = (north - south) * 111000

    print(f"Location: {name}")
    print(f"Center: {center_lat:.4f}N, {center_lon:.4f}E")
    print(f"Bbox: W={west:.4f} S={south:.4f} E={east:.4f} N={north:.4f}")
    print(f"World size: {world_w:.0f}m E-W x {world_d:.0f}m N-S")

    # ── 1. Elevation from USGS 3DEP ──
    print("\n[1/2] Downloading elevation data from USGS 3DEP...")
    dem_url = (
        "https://elevation.nationalmap.gov/arcgis/rest/services/"
        "3DEPElevation/ImageServer/exportImage"
    )
    resp = requests.get(dem_url, params={
        'bbox': f'{west},{south},{east},{north}',
        'bboxSR': '4326', 'imageSR': '4326',
        'size': '1024,1024', 'format': 'tiff',
        'pixelType': 'F32',
        'interpolation': 'RSP_BilinearInterpolation',
        'f': 'image',
    }, timeout=60)
    print(f"  Response: {resp.status_code}, {len(resp.content)} bytes")

    if resp.status_code != 200 or len(resp.content) < 1000:
        print(f"  ERROR: {resp.text[:500]}")
        return None

    import rasterio
    from rasterio.io import MemoryFile

    with MemoryFile(resp.content) as memfile:
        with memfile.open() as dataset:
            elev = dataset.read(1)
            nodata = dataset.nodata
            if nodata is not None:
                elev[elev == nodata] = np.nanmin(elev[elev != nodata])
            elev = np.nan_to_num(elev, nan=np.nanmin(elev))

            elev_min = float(np.min(elev))
            elev_max = float(np.max(elev))
            print(f"  Elevation: {elev_min:.1f}m to {elev_max:.1f}m")

            heightmap = ((elev - elev_min) / (elev_max - elev_min) * 255).astype(np.uint8)
            hm_path = f'{name}_heightmap_1024.png'
            Image.fromarray(heightmap, mode='L').save(hm_path)
            print(f"  Saved {hm_path}")

    # ── 2. Satellite from ESRI World Imagery ──
    print("\n[2/2] Downloading satellite imagery from ESRI...")
    sat_url = (
        "https://services.arcgisonline.com/arcgis/rest/services/"
        "World_Imagery/MapServer/export"
    )
    resp = requests.get(sat_url, params={
        'bbox': f'{west},{south},{east},{north}',
        'bboxSR': '4326', 'imageSR': '4326',
        'size': '2048,2048', 'format': 'jpg',
        'f': 'image',
    }, timeout=60)
    print(f"  Response: {resp.status_code}, {len(resp.content)} bytes")

    if resp.status_code != 200 or len(resp.content) < 1000:
        print(f"  ERROR: {resp.text[:500]}")
        return None

    sat_path = f'{name}_satellite_2048.jpg'
    Image.open(io.BytesIO(resp.content)).save(sat_path, quality=90)
    print(f"  Saved {sat_path}")

    # ── Summary ──
    print(f"\nDone! Add to terrainConfigs in terrain.js:")
    print(f"  {name}: {{")
    print(f"    label: '...',")
    print(f"    heightmap: 'terrain-data/{hm_path}',")
    print(f"    satellite: 'terrain-data/{sat_path}',")
    print(f"    elevMin: {elev_min:.1f},")
    print(f"    elevMax: {elev_max:.1f},")
    print(f"    worldW: {world_w:.0f},")
    print(f"    worldD: {world_d:.0f},")
    print(f"    waterY: 3.0,")
    print(f"    waterThresh: 12,")
    print(f"    useRiverMask: true,")
    print(f"    preset: 'gorge',")
    print(f"    startPos: null")
    print(f"  }}")

    return {
        'elevMin': elev_min, 'elevMax': elev_max,
        'worldW': world_w, 'worldD': world_d,
    }


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    name = sys.argv[1]
    lat = float(sys.argv[2])
    lon = float(sys.argv[3])
    w = float(sys.argv[4]) if len(sys.argv) > 4 else 14.4
    h = float(sys.argv[5]) if len(sys.argv) > 5 else 11.0

    fetch_terrain(name, lat, lon, w, h)
