import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarRental — Pick-up & Drop-off",
  description:
    "Search cities for pick-up and drop-off. Drop-off is restricted to the same country or a land-border neighbour.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
