import type { Metadata, Viewport } from "next";
import { Manrope, Spectral } from "next/font/google";
import { APP_NAME, APP_SHORT_NAME, APP_TAGLINE } from "@/lib/brand";
import { DiceProvider } from "./components/dice/dice-provider";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  appleWebApp: { title: APP_SHORT_NAME, statusBarStyle: "black" },
};

export const viewport: Viewport = { themeColor: "#15130F" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${spectral.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <DiceProvider>{children}</DiceProvider>
      </body>
    </html>
  );
}
