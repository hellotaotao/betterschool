import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    // Needed for the prerendered pages to emit absolute canonical/OG URLs.
    metadataBase: new URL(SITE_URL),
    title: {
        default: `${SITE_NAME} — Australian schools, by where you live`,
        template: `%s | ${SITE_NAME}`,
    },
    description:
        "Find the schools around an address: official ACARA profiles for 11,034 Australian schools and NSW government intake zones. No ranking, no composite score.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`antialiased ${inter.className}`}>
                {children}
                <Analytics />
            </body>
        </html>
    );
}
