import SchoolMap from "./components/SchoolMap";

export default function Home() {
    return (
        <main className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-center mb-8">School Map</h1>
            <div style={{ width: "100%", height: "600px" }}>
                <SchoolMap />
            </div>
        </main>
    );
}
