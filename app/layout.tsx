import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { SettingsProvider } from "@/contexts/settings-context"
import Script from "next/script"
import { Toaster } from "@/components/ui/toaster"


export const metadata: Metadata = {
  title: "Taleem - Islamic Learning Platform",
  description: "A modern Islamic learning platform for students, teachers, and parents",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-switcher" strategy="beforeInteractive">
          {`
          (function() {
            try {
              // Get theme from localStorage
              var storedTheme = localStorage.getItem('taleem-theme');
              var storedColor = localStorage.getItem('taleem-color');
              
              // Apply theme immediately to prevent flash
              if (storedTheme) {
                if (storedTheme === 'dark') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.setAttribute('data-theme', 'dark');
                } else if (storedTheme === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.setAttribute('data-theme', 'light');
                } else if (storedTheme === 'system') {
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (prefersDark) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                }
              }
              
              // Apply color accent
              if (storedColor) {
                document.documentElement.setAttribute('data-accent', storedColor);
                document.documentElement.style.setProperty('--primary', 'var(--color-' + storedColor + ')');
              }
            } catch (e) {
              console.error('Error in theme initialization script:', e);
            }
          })();
        `}
        </Script>
      </head>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
        <Toaster />
      </body>
    </html>
  )
}
