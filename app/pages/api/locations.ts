import { NextApiRequest, NextApiResponse } from "next";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function openDb() {
    return open({
        filename: "../../db/database",
        driver: sqlite3.Database,
    });
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const db = await openDb();

    try {
        const schools = await db.all(
            "SELECT id, name, latitude, longitude FROM locations WHERE type = 'school'"
        );
        res.status(200).json(schools);
    } catch (error) {
        res.status(500).json({ error: "Error fetching school data" });
    } finally {
        await db.close();
    }
}
