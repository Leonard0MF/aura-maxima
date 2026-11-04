import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leonardo Machmann — Developer, Builder & Security",
  description: "Leonardo — Developer, Builder & Security-minded Engineer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}