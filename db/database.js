const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");

async function openDb() {
    return open({
        filename: "./db/locations.sqlite",
        driver: sqlite3.Database,
    });
}

async function setup() {
    const db = await openDb();
    await db.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      latitude REAL,
      longitude REAL
    )
  `);

    // Insert sample data if the table is empty
    const count = await db.get("SELECT COUNT(*) as count FROM locations");
    if (count.count === 0) {
        await db.exec(`
      INSERT INTO locations (name, latitude, longitude) VALUES
        ('New York', 40.7128, -74.0060),
        ('Los Angeles', 34.0522, -118.2437),
        ('Chicago', 41.8781, -87.6298)
    `);
    }

    await db.close();
}

setup();

module.exports = { openDb };
