import "./global.css";

import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CreationProvider } from "@/context/CreationContext";
import { RouteLoader } from "@/components/common/RouteLoader";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy load route components for code splitting
const IpfiAssistant = lazy(() => import("@/pages/IpfiAssistant"));
const IpImagine = lazy(() => import("@/pages/IpImagine"));
const IpImagineCreationResult = lazy(
  () => import("@/pages/IpImagineCreationResult"),
);
const NftMarketplace = lazy(() => import("@/pages/NftMarketplace"));
const MyPortfolio = lazy(() => import("@/pages/MyPortfolio"));
const Settings = lazy(() => import("@/pages/Settings"));
const History = lazy(() => import("@/pages/History"));

declare global {
  interface Window {
    __privyAnalyticsFetchPatched?: boolean;
  }
}

const ensurePrivyAnalyticsFetchPatched = () => {
  if (typeof window === "undefined") return;
  if (window.__privyAnalyticsFetchPatched) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    try {
      return await originalFetch(...args);
    } catch (error) {
      const input = args[0];
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : undefined;
      if (url && url.includes("edge.fullstory.com")) {
        return new Response(null, {
          status: 204,
          statusText: "No Content",
        });
      }
      throw error;
    }
  };
  window.__privyAnalyticsFetchPatched = true;
};

const queryClient = new QueryClient();
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route
        path="/ipfi-assistant"
        element={
          <Suspense fallback={<RouteLoader />}>
            <IpfiAssistant />
          </Suspense>
        }
      />
      <Route
        path="/ip-imagine"
        element={
          <Suspense fallback={<RouteLoader />}>
            <IpImagine />
          </Suspense>
        }
      />
      <Route
        path="/ip-imagine/result"
        element={
          <Suspense fallback={<RouteLoader />}>
            <IpImagineCreationResult />
          </Suspense>
        }
      />
      <Route
        path="/nft-marketplace"
        element={
          <Suspense fallback={<RouteLoader />}>
            <NftMarketplace />
          </Suspense>
        }
      />
      <Route
        path="/my-portfolio"
        element={
          <Suspense fallback={<RouteLoader />}>
            <MyPortfolio />
          </Suspense>
        }
      />
      <Route
        path="/settings"
        element={
          <Suspense fallback={<RouteLoader />}>
            <Settings />
          </Suspense>
        }
      />
      <Route
        path="/history"
        element={
          <Suspense fallback={<RouteLoader />}>
            <History />
          </Suspense>
        }
      />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

const App = () => {
  ensurePrivyAnalyticsFetchPatched();

  const appContent = (
    <CreationProvider>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
      </QueryClientProvider>
    </CreationProvider>
  );

  if (!privyAppId) {
    return appContent;
  }

  return <PrivyProvider appId={privyAppId}>{appContent}</PrivyProvider>;
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
