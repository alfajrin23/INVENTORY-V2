import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthGate } from '@/components/auth-gate'
import { AppShell } from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InventoryProvider } from '@/hooks/use-inventory'
import { ToastProvider } from '@/hooks/use-toast'
import { routes } from '@/lib/navigation'

const DashboardPage = lazy(() => import('@/pages/dashboard-page').then((module) => ({ default: module.DashboardPage })))
const ProductsPage = lazy(() => import('@/pages/products-page').then((module) => ({ default: module.ProductsPage })))
const HistoryPage = lazy(() => import('@/pages/history-page').then((module) => ({ default: module.HistoryPage })))
const ReportsHubPage = lazy(() => import('@/pages/reports-hub-page').then((module) => ({ default: module.ReportsHubPage })))
const SettingsPage = lazy(() => import('@/pages/settings-page').then((module) => ({ default: module.SettingsPage })))
const ProfileSettingsPage = lazy(() =>
  import('@/pages/profile-settings-page').then((module) => ({ default: module.ProfileSettingsPage })),
)
const IncomingReportPage = lazy(() => import('@/pages/report-pages').then((module) => ({ default: module.IncomingReportPage })))
const OutgoingReportPage = lazy(() => import('@/pages/report-pages').then((module) => ({ default: module.OutgoingReportPage })))
const StockReportPage = lazy(() => import('@/pages/report-pages').then((module) => ({ default: module.StockReportPage })))
const RevenueAnnualPage = lazy(() => import('@/pages/report-pages').then((module) => ({ default: module.RevenueAnnualPage })))
const RevenueDailyPage = lazy(() => import('@/pages/report-pages').then((module) => ({ default: module.RevenueDailyPage })))
const RevenueWeeklyPage = lazy(() => import('@/pages/report-pages').then((module) => ({ default: module.RevenueWeeklyPage })))
const RevenueMonthlyPage = lazy(() => import('@/pages/report-pages').then((module) => ({ default: module.RevenueMonthlyPage })))

function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <ToastProvider>
          <AuthGate><InventoryProvider>
            <Suspense fallback={<div className="p-6 text-sm text-white/60">Memuat halaman</div>}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="/index.html" element={<DashboardPage />} />
                  <Route path={routes.products} element={<ProductsPage />} />
                  <Route path={routes.history} element={<HistoryPage />} />
                  <Route path={routes.reports} element={<ReportsHubPage />} />
                  <Route path={routes.incomingReport} element={<IncomingReportPage />} />
                  <Route path={routes.outgoingReport} element={<OutgoingReportPage />} />
                  <Route path={routes.stockReport} element={<StockReportPage />} />
                  <Route path={routes.revenueYear} element={<RevenueAnnualPage />} />
                  <Route path={routes.revenueDay} element={<RevenueDailyPage />} />
                  <Route path={routes.revenueWeek} element={<RevenueWeeklyPage />} />
                  <Route path={routes.revenueMonth} element={<RevenueMonthlyPage />} />
                  <Route path={routes.settings} element={<SettingsPage />} />
                  <Route path={routes.profile} element={<ProfileSettingsPage />} />
                  <Route path="*" element={<Navigate to={routes.dashboard} replace />} />
                </Route>
              </Routes>
            </Suspense>
          </InventoryProvider></AuthGate>
        </ToastProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}

export default App
