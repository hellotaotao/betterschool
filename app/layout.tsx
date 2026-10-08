import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { coveredCatchmentStates, getMessages } from "@/lib/i18n";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    // Needed for the prerendered pages to emit absolute canonical/OG URLs.
    metadataBase: new URL(SITE_URL),
    title: {
        default: `${SITE_NAME} — Australian schools, by where you live`,
        template: `%s | ${SITE_NAME}`,
    },
    // States come from the published layers, so adding one cannot leave this
    // describing a smaller site than the one that ships.
    description:
        `Find the schools around an address: official ACARA profiles for 11,034 Australian schools and government intake zones for ${coveredCatchmentStates(getMessages("en"), "en")}. No ranking, no composite score.`,
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
