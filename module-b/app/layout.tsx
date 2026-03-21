import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"

import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "CheckInOut - Hostel Management",
  description: "Secure hostel management system with RBAC, audit logging, and indexed SQLite storage.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={jetbrainsMono.variable}>
      <body className="font-mono antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
