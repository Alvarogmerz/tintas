import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tintas Auto",
  description: "Gestión y pedido automático de tinta/tóner",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col bg-slate-50 text-slate-900"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
