import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AndroidBackHandler } from '@/components/android-back-handler'
import { AppUpdatePrompt } from '@/components/app-update-prompt'
import { AuthGate } from '@/components/auth-gate'
import { AppShell } from '@/components/layout/app-shell'
import { ThermalPrintController } from '@/components/printer/thermal-print-controller'
import { ReleaseNotesPrompt } from '@/components/release-notes/release-notes-prompt'
import { ShoppingNotificationRouter } from '@/components/shopping/shopping-notification-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InventoryProvider } from '@/hooks/use-inventory'
import { ToastProvider } from '@/hooks/use-toast'
import { routes } from '@/lib/navigation'

const loadDashboardPage = () => import('@/pages/dashboard-page')
const loadProductsPage = () => import('@/pages/products-with-tools-page')
const loadHistoryPage = () => import('@/pages/history-page')
const loadReportsHubPage = () => import('@/pages/reports-hub-page')
const loadSettingsPage = () => import('@/pages/settings-with-guide-page')
const loadLogsInputPage = () => import('@/pages/logs-input-page')
const loadProfileSettingsPage = () => import('@/pages/profile-settings-page')
const loadReportPages = () => import('@/pages/report-pages')
const loadRevenuePages = () => import('@/pages/revenue-sorted-pages')
const loadOutgoingReportPage = () => import('@/pages/outgoing-report-page')
const loadShoppingPage = () => import('@/pages/shopping-page')
const loadUpdateHistoryPage = () => import('@/pages/update-history-page')

const DashboardPage = lazy(() => loadDashboardPage().then((module) => ({ default: module.DashboardPage })))
const ProductsPage = lazy(() => loadProductsPage().then((module) => ({ default: module.ProductsWithToolsPage })))
const HistoryPage = lazy(() => loadHistoryPage().then((module) => ({ default: module.HistoryPage })))
const ReportsHubPage = lazy(() => loadReportsHubPage().then((module) => ({ default: module.ReportsHubPage })))
const SettingsPage = lazy(() => loadSettingsPage().then((module) => ({ default: module.SettingsWithGuidePage })))
const LogsInputPage = lazy(() => loadLogsInputPage().then((module) => ({ default: module.LogsInputPage })))
const ProfileSettingsPage = lazy(() => loadProfileSettingsPage().then((module) => ({ default: module.ProfileSettingsPage })))
const IncomingReportPage = lazy(() => loadReportPages().then((module) => ({ default: module.IncomingReportPage })))
const OutgoingReportPage = lazy(() => loadOutgoingReportPage().then((module) => ({ default: module.OutgoingReportPage })))
const StockReportPage = lazy(() => loadReportPages().then((module) => ({ default: module.StockReportPage })))
const RevenueAnnualPage = lazy(() => loadRevenuePages().then((module) => ({ default: module.RevenueAnnualPage })))
const RevenueDailyPage = lazy(() => loadRevenuePages().then((module) => ({ default: module.RevenueDailyPage })))
const RevenueWeeklyPage = lazy(() => loadRevenuePages().then((module) => ({ default: module.RevenueWeeklyPage })))
const RevenueMonthlyPage = lazy(() => loadRevenuePages().then((module) => ({ default: module.RevenueMonthlyPage })))
const ShoppingPage = lazy(() => loadShoppingPage().then((module) => ({ default: module.ShoppingPage })))
const UpdateHistoryPage = lazy(() => loadUpdateHistoryPage().then((module) => ({ default: module.UpdateHistoryPage })))

type NetworkInformation = { saveData?: boolean; effectiveType?: string }
type NavigatorWithConnection = Navigator & { connection?: NetworkInformation }
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

function RoutePreloader() {
  useEffect(() => {
    const connection = (navigator as NavigatorWithConnection).connection
    if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return

    const preload = () => {
      void Promise.allSettled([
        loadProductsPage(),
        loadHistoryPage(),
        loadReportsHubPage(),
        loadOutgoingReportPage(),
      ])
    }

    const idleWindow = window as IdleWindow
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(preload, { timeout: 1800 })
      return () => idleWindow.cancelIdleCallback?.(handle)
    }

    const timer = window.setTimeout(preload, 900)
    return () => window.clearTimeout(timer)
  }, [])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <ToastProvider>
          <AndroidBackHandler />
          <AuthGate><InventoryProvider>
            <RoutePreloader />
            <AppUpdatePrompt />
            <ReleaseNotesPrompt />
            <ThermalPrintController />
            <ShoppingNotificationRouter />
            <Suspense fallback={<div className="p-6 text-sm text-white/60">Memuat halaman...</div>}>
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
                  <Route path={routes.shopping} element={<ShoppingPage />} />
                  <Route path={routes.updates} element={<UpdateHistoryPage />} />
                  <Route path={routes.settings} element={<SettingsPage />} />
                  <Route path={routes.logsInput} element={<LogsInputPage />} />
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
