import "./globals.css";
import SyncInit from "@/components/SyncInit";

export const metadata = {
  title: "Livestock ERP",
  description: "From Animal Birth to Milk Profit — offline-first dairy farm management",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#166534",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900 antialiased">
        <SyncInit />
        {children}
      </body>
    </html>
  );
}
