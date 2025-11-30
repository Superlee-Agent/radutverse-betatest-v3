import { type ReactNode, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { APP_NAV_ITEMS, type AppNavItem } from "@/config/navigation";

const BRAND_NAME = "Radut Verse";
const BRAND_IMAGE_URL =
  "https://cdn.builder.io/api/v1/image/assets%2Fc692190cfd69486380fecff59911b51b%2F52cfa9fa715049a49469c1473e1a313e";

const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
};

type DashboardLayoutProps = {
  title: string;
  avatarSrc?: string;
  actions?: ReactNode;
  children: ReactNode;
  navItems?: AppNavItem[];
  sidebarExtras?: (options: { closeSidebar: () => void }) => ReactNode;
  onLogoClick?: () => void;
};

export const DashboardLayout = ({
  title,
  avatarSrc,
  actions,
  children,
  navItems = APP_NAV_ITEMS,
  sidebarExtras,
  onLogoClick,
}: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderBrandHeader = () => (
    <button
      onClick={onLogoClick}
      className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 border-0 bg-transparent hover:opacity-80 transition-opacity cursor-pointer"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF4DA6]/10"
        style={{
          backgroundImage: `url(${BRAND_IMAGE_URL})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      />
      <div className="text-base font-bold text-[#FF4DA6]">{BRAND_NAME}</div>
    </button>
  );

  const renderNavItems = (closeSidebar?: () => void) => (
    <nav className="mt-6 flex-1 w-full text-slate-300 space-y-1">
      <ul className="flex flex-col gap-1">
        {navItems.map((item) => {
          const ItemIcon = item.icon;
          return (
            <li key={item.id}>
              <NavLink
                to={item.to}
                className={({ isActive }) => {
                  const baseClasses =
                    "flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-colors";
                  const activeClasses = "bg-[#FF4DA6]/15 text-[#FF4DA6]";
                  const inactiveClasses =
                    "text-slate-400 hover:text-slate-200 hover:bg-white/5";
                  return [
                    baseClasses,
                    isActive ? activeClasses : inactiveClasses,
                  ].join(" ");
                }}
                onClick={() => closeSidebar?.()}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800/50 text-slate-500">
                  <ItemIcon className="h-4 w-4" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const sidebar = (
    <div className="flex w-full flex-col gap-6">
      {renderBrandHeader()}
      {renderNavItems(() => setSidebarOpen(false))}
      {sidebarExtras
        ? sidebarExtras({ closeSidebar: () => setSidebarOpen(false) })
        : null}
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100">
      <div className="flex min-h-[100dvh] w-full md:overflow-hidden">
        <aside className="hidden md:flex w-64 flex-col bg-slate-950/80 text-slate-100 py-6 px-4 sticky top-0 max-h-screen min-h-screen overflow-y-auto">
          {sidebar}
        </aside>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              className="fixed inset-0 z-50 md:hidden flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="fixed inset-0 bg-black/40"
                onClick={() => setSidebarOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.aside
                className="relative w-[85vw] max-w-[320px] bg-slate-950/90 text-slate-100 py-6 px-4 h-full overflow-y-auto"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">{renderBrandHeader()}</div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-md border-0 bg-transparent text-[#FF4DA6] hover:bg-[#FF4DA6]/10 transition-colors"
                    aria-label="Close menu"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-6">
                  {renderNavItems(() => setSidebarOpen(false))}
                  {sidebarExtras
                    ? sidebarExtras({
                        closeSidebar: () => setSidebarOpen(false),
                      })
                    : null}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 flex min-h-0">
          <div className="chat-wrap w-full h-full min-h-0 flex flex-col bg-slate-950/40">
            <motion.header
              className="flex items-center gap-4 px-6 py-3.5 bg-slate-950/70"
              variants={fadeUp}
              initial="initial"
              animate="animate"
            >
              <button
                type="button"
                className="md:hidden p-3 rounded-md border-0 bg-transparent text-[#FF4DA6] hover:bg-[#FF4DA6]/10 active:scale-[0.98] transition-all"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt="Dashboard avatar"
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : null}
              <div>
                <h1 className="text-lg font-bold text-[#FF4DA6]">{title}</h1>
              </div>
              <div className="ml-auto flex items-center gap-3">{actions}</div>
            </motion.header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
