import type { Metadata } from "next";
import { Manrope, Spectral } from "next/font/google";
import { DiceProvider } from "./components/dice/dice-provider";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "D&D AI",
  description: "Your campaign companion",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${spectral.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <DiceProvider>{children}</DiceProvider>
      </body>
    </html>
  );
}
