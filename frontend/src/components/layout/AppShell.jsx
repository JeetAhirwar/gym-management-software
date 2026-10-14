import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { SidebarContent, MobileSidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
export function AppShell() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();
    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);
    useEffect(() => {
        document.title = "Pulse Gym Suite";
    }, []);
    return (<div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/70 bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)}/>

      <div className="lg:pl-64">
        <Topbar onOpenMenu={() => setMobileOpen(true)}/>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>);
}
