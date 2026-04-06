import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "School Map",
    description: "Interactive map of school rankings in Australia",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://tile.openstreetmap.org" crossOrigin="anonymous" />
                <link rel="dns-prefetch" href="https://tile.openstreetmap.org" />
            </head>
            <body className={`antialiased ${inter.className}`}>
                {children}
            </body>
        </html>
    );
}
