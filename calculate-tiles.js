// Calculate tile count for Davao City
const latLonToTile = (lat, lon, zoom) => {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  return { x, y };
};

const DAVAO_BOUNDS = { minLat: 6.9, maxLat: 7.2, minLon: 125.5, maxLon: 125.7 };
const ZOOM_LEVELS = [10, 11, 12, 13, 14, 15, 16, 17, 18];

let total = 0;
ZOOM_LEVELS.forEach(zoom => {
  const minTile = latLonToTile(DAVAO_BOUNDS.maxLat, DAVAO_BOUNDS.minLon, zoom);
  const maxTile = latLonToTile(DAVAO_BOUNDS.minLat, DAVAO_BOUNDS.maxLon, zoom);
  const tilesX = maxTile.x - minTile.x + 1;
  const tilesY = maxTile.y - minTile.y + 1;
  const zoomTotal = tilesX * tilesY;
  console.log(`Zoom ${zoom}: ${tilesX} x ${tilesY} = ${zoomTotal} tiles`);
  total += zoomTotal;
});

console.log(`\nTotal tiles needed: ${total.toLocaleString()}`);
console.log(`Estimated storage: ${Math.round(total * 15 / 1024)} MB`);
