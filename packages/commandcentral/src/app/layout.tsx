import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AiMessage",
  description: "Your AI asks before it acts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='black'/></svg>" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body style={{ margin: 0, background: "#f5f5f7", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif" }}>
        {/* iPhone frame on desktop, fullscreen on mobile */}
        <div className="phone-wrapper">
          <div className="phone-frame">
            {/* Notch */}
            <div className="phone-notch" />
            {/* Content */}
            <div className="phone-screen">
              {children}
            </div>
            {/* Home indicator */}
            <div className="phone-home" />
          </div>
        </div>

        <style>{`
          /* Mobile: fullscreen, no frame */
          @media (max-width: 500px) {
            body { background: #fff !important; }
            .phone-wrapper { height: 100dvh; }
            .phone-frame { height: 100%; border: none !important; border-radius: 0 !important; box-shadow: none !important; }
            .phone-notch { display: none !important; }
            .phone-home { display: none !important; }
            .phone-screen { border-radius: 0 !important; height: 100%; }
          }

          /* Desktop: centered iPhone frame */
          @media (min-width: 501px) {
            .phone-wrapper {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 40px 20px;
            }
            .phone-frame {
              width: 390px;
              height: 844px;
              border: 8px solid #1d1d1f;
              border-radius: 50px;
              overflow: hidden;
              position: relative;
              background: #fff;
              box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
            }
            .phone-notch {
              position: absolute;
              top: 0;
              left: 50%;
              transform: translateX(-50%);
              width: 126px;
              height: 34px;
              background: #1d1d1f;
              border-radius: 0 0 20px 20px;
              z-index: 100;
            }
            .phone-screen {
              height: 100%;
              overflow: hidden;
              border-radius: 42px;
            }
            .phone-home {
              position: absolute;
              bottom: 8px;
              left: 50%;
              transform: translateX(-50%);
              width: 134px;
              height: 5px;
              background: #1d1d1f;
              border-radius: 3px;
              z-index: 100;
            }
          }
        `}</style>
      </body>
    </html>
  );
}
