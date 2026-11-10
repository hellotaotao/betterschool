import type { Metadata } from "next";
import "./globals.css";
import { Bricolage_Grotesque, DM_Sans, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import LinkEvents from "@/components/LinkEvents";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { coveredCatchmentStates, getMessages } from "@/lib/i18n";
import { DEFAULT_THEME, themeBootScript } from "@/lib/theme";

// Theme fonts, exposed as CSS variables for the tokens in globals.css; the SEO
// pages and the map app both read them.
// Only the default theme's pair preloads; the others download only when a
// page actually renders in their theme.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", preload: false });
const plexSans = IBM_Plex_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-plex-sans",
    display: "swap",
    preload: false,
});
const fontVariables = [bricolage, dmSans, newsreader, plexSans].map(font => font.variable).join(" ");

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
        <html lang="en" data-theme={DEFAULT_THEME} className={fontVariables} suppressHydrationWarning>
            <head>
                {/* Runs before first paint so a remembered or linked theme
                    never flashes the default; see lib/theme.ts. */}
                <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
            </head>
            <body className="antialiased">
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
                />
                {children}
                <Analytics />
                <LinkEvents />
            </body>
        </html>
    );
}
