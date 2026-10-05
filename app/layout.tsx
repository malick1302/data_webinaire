import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Datawebinaires",
  description: "POC Google Meet : une question, deux identités.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
