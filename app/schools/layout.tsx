import { preconnect } from 'react-dom';

// The basemap tiles are the map's largest paint, and Leaflet only requests them
// once its chunk has loaded and the map has measured itself. Opening the
// connection from the HTML takes the DNS + TLS round trips off that path.
export default function SchoolsLayout({ children }: { children: React.ReactNode }) {
  preconnect('https://tile.openstreetmap.org');
  return children;
}
