import SchoolMap from "./components/SchoolMap";

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-between p-24">
            <h1>School Map</h1>
            <div style={{ width: "100%", height: "600px" }}>
                <SchoolMap />
            </div>
        </main>
    );
}
