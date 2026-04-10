#!/bin/bash
# Deploy FoilSim to foil-brain.com via FTPS
# Usage: ./deploy.sh [--full]
#   Default: uploads core files (index.html, js/, assets/, terrain-data/)
#   --full:  also uploads experiments and viewer

# Load credentials from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "ERROR: .env file not found. Create it with FTP_HOST, FTP_USER, FTP_PASS"
  exit 1
fi

FTP_OPTS="--ssl-reqd -u ${FTP_USER}:${FTP_PASS}"
FTP_BASE="ftp://${FTP_HOST}"

upload_file() {
  local src="$1"
  local dest="$2"
  echo "  ↑ $dest"
  curl -s ${FTP_OPTS} -T "$src" "${FTP_BASE}/${dest}" 2>/dev/null
}

mkd() {
  curl -s ${FTP_OPTS} "${FTP_BASE}/" -Q "MKD $1" 2>/dev/null || true
}

echo "=== Deploying FoilSim to foil-brain.com ==="
echo ""

# Create remote directories
mkd js
mkd assets
mkd terrain-data

# Core files
echo "[1/4] Core files..."
upload_file "index.html" "index.html"

# JS modules
echo "[2/4] JS modules..."
for f in js/*.js; do
  upload_file "$f" "js/$(basename $f)"
done

# Assets (surfer model etc)
echo "[3/4] Assets..."
upload_file "assets/surfer.glb" "assets/surfer.glb"

# Terrain data
echo "[4/4] Terrain data..."
for f in terrain-data/*.png terrain-data/*.jpg; do
  [ -f "$f" ] && upload_file "$f" "terrain-data/$(basename $f)"
done

# Optional: full deploy includes experiments and viewer
if [ "$1" = "--full" ]; then
  echo "[extra] Experiments & viewer..."
  upload_file "experiments.html" "experiments.html"
  upload_file "surfer-viewer.html" "surfer-viewer.html"
  mkd ocean_sim_experiments
  mkd ocean_sim_experiments/ref1
  for f in ocean_sim_experiments/ref1/*.html; do
    [ -f "$f" ] && upload_file "$f" "ocean_sim_experiments/ref1/$(basename $f)"
  done
fi

echo ""
echo "=== Deploy complete ==="
echo "Visit: http://foil-brain.com"
