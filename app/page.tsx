import Link from "next/link";

export default function Home() {
    return (
        <main className="container mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-screen bg-gray-50">
            <h1 className="text-4xl font-bold text-gray-900 mb-6">Welcome to BetterSchool</h1>
            <p className="text-xl text-gray-600 mb-8 text-center max-w-2xl">
                Find the best primary schools in your area with our interactive map and ranking tool.
            </p>
            <Link 
                href="/schools" 
                className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors shadow-lg"
            >
                Explore Top Schools
            </Link>
        </main>
    );
}
