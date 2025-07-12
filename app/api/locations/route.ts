import { NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

export async function openDb() {
    return open({
        filename: path.join(process.cwd(), "db", "locations.sqlite"),
        driver: sqlite3.Database,
    });
}

export async function GET() {
    try {
        const db = await openDb();
        
        const schools = await db.all(
            "SELECT id, name, latitude, longitude FROM locations"
        );
        
        await db.close();
        
        return NextResponse.json(schools);
    } catch (error) {
        console.error("Database error:", error);
        return NextResponse.json(
            { error: "Error fetching school data" },
            { status: 500 }
        );
    }
}
