import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FAIZAN AHMED CHATS",
  description: "A private, real-time messaging space.",
  icons: { icon: "/logo.jpg" },
  applicationName: "FAIZAN AHMED CHATS"
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
