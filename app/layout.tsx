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
    // Leads with the zone lookup, in the words parents search with ("school
    // zone", "catchment"); the data source belongs on the page, not here.
    title: {
        default: `${SITE_NAME} — Australian school zone & catchment map`,
        template: `%s | ${SITE_NAME}`,
    },
    // States come from the published layers, so adding one cannot leave this
    // describing a smaller site than the one that ships.
    description:
        `Check which school zone an address falls in and compare the schools nearby. Catchment maps for ${coveredCatchmentStates(getMessages("en"), "en")}, plus 11,034 schools Australia-wide.`,
};

// The root URL only redirects to the map, so the site identity rides on every
// page. Without it Google labels results with the bare lowercase domain.
const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: ["BetterSchool", "betterschool.au"],
    url: `${SITE_URL}/`,
    inLanguage: ["en-AU", "zh-Hans"],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`antialiased ${inter.className}`}>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
                />
                {children}
                <Analytics />
            </body>
        </html>
    );
}
