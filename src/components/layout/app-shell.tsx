import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  Bell,
  ChevronDown,
  MapPin,
  Moon,
  Mic,
  Power,
  ScanLine,
  Search,
  Settings,
  Store,
  Sun,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { TransactionWorkflow } from '@/components/inventory/transaction-workflow'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { buildWhatsAppSummary, matchProduct } from '@/lib/format'
import { mobileNavigation, navigationItems, routes } from '@/lib/navigation'
import { inventoryNotificationContent, INVENTORY_NOTIFICATION_ID, prepareInventoryNotification, showInventoryNotification } from '@/lib/android-notifications'
import { cn } from '@/lib/utils'

function isActive(currentPath: string, targetPath: string) {
  if (targetPath === routes.reports && Object.values(routes).filter(p => /laporan|pendapatan/.test(p)).includes(currentPath)) return true
  if (targetPath === routes.dashboard) {
    return currentPath === routes.dashboard
  }

  return currentPath === targetPath
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const { activeStore, stores, products, history, loading, mode, setActiveStore } = useInventory()
  const { showToast } = useToast()
  const [scanOpen, setScanOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [notificationReady, setNotificationReady] = useState(false)
  const [notificationIssue, setNotificationIssue] = useState('')
  const lastNotificationSignature = useRef('')
  const lastNotificationError = useRef('')
  const loadingRef = useRef(loading)
  const pendingNotificationVoice = useRef(false)
  const reportNotificationError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Notifikasi Android gagal ditampilkan. Ketuk lonceng untuk mencoba lagi.'
    setNotificationIssue(message)
    if (lastNotificationError.current !== message) {
      lastNotificationError.current = message
      showToast(message, 'error')
    }
  }, [showToast])
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') {
      return 'dark'
    }

    const stored = localStorage.getItem('theme')
    return stored === 'light' || (!stored && window.matchMedia('(max-width: 1023px)').matches) ? 'light' : 'dark'
  })
  const [search, setSearch] = useState('')
  const profilePhoto = typeof window !== 'undefined' ? localStorage.getItem('profilePhoto') : ''
  const groupedNav = useMemo(
    () => ({
      utama: navigationItems.filter((item) => item.group === 'utama'),
      laporan: navigationItems.filter((item) => item.group === 'laporan'),
    }),
    [],
  )
  const searchResults = useMemo(() => {
    if (!search.trim()) {
      return []
    }

    return products.filter((product) => matchProduct(product, search)).slice(0, 5)
  }, [products, search])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    loadingRef.current = loading
    if (loading || !pendingNotificationVoice.current) return
    pendingNotificationVoice.current = false
    const timer = window.setTimeout(() => setVoiceOpen(true), 0)
    return () => window.clearTimeout(timer)
  }, [loading])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let closed = false
    let removeListener: (() => Promise<void>) | undefined
    const setup = async () => {
      const listener = await LocalNotifications.addListener('localNotificationActionPerformed', action => {
        navigate(routes.dashboard)
        if (action.actionId === 'voice') {
          if (loadingRef.current) pendingNotificationVoice.current = true
          else setVoiceOpen(true)
        }
      })
      removeListener = () => listener.remove()
      if (closed) { await listener.remove(); return }
      await prepareInventoryNotification()
      if (!closed) setNotificationReady(true)
    }
    void setup().catch(error => { if (!closed) reportNotificationError(error) })
    return () => {
      closed = true
      if (removeListener) void removeListener()
    }
  }, [navigate, reportNotificationError])

  const notificationStoreName = activeStore?.name ?? 'Inventory'
  const notificationContent = useMemo(
    () => inventoryNotificationContent(notificationStoreName, products),
    [notificationStoreName, products],
  )
  const notificationDetails = notificationContent.inboxList?.join('|') ?? ''
  const notificationSignature = `${activeStore?.id ?? ''}|${notificationContent.title}|${notificationContent.body}|${notificationDetails}`
  useEffect(() => {
    if (!notificationReady) return
    if (lastNotificationSignature.current === notificationSignature) return
    const timer = window.setTimeout(() => {
      void showInventoryNotification(notificationStoreName, products)
        .then(() => {
          lastNotificationSignature.current = notificationSignature
          lastNotificationError.current = ''
          setNotificationIssue('')
        })
        .catch(reportNotificationError)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [notificationReady, notificationSignature, notificationStoreName, products, reportNotificationError])

  useEffect(() => {
    if (!notificationReady) return
    const restoreNotification = () => {
      void LocalNotifications.getDeliveredNotifications()
        .then(({ notifications }) => {
          if (notifications.some(notification => notification.id === INVENTORY_NOTIFICATION_ID)) return
          return showInventoryNotification(notificationStoreName, products).then(() => {
            lastNotificationSignature.current = notificationSignature
            lastNotificationError.current = ''
            setNotificationIssue('')
          })
        })
        .catch(reportNotificationError)
    }
    const onVisibilityChange = () => { if (!document.hidden) restoreNotification() }
    window.addEventListener('focus', restoreNotification)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', restoreNotification)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [notificationReady, notificationSignature, notificationStoreName, products, reportNotificationError])

  const enableNotifications = async () => {
    if (!Capacitor.isNativePlatform()) {
      showToast('Notifikasi panel tersedia di aplikasi Android.', 'success')
      return
    }
    try {
      await prepareInventoryNotification(true)
      await showInventoryNotification(notificationStoreName, products)
      lastNotificationSignature.current = notificationSignature
      lastNotificationError.current = ''
      setNotificationIssue('')
      setNotificationReady(true)
      showToast('Notifikasi inventory aktif di panel Android.', 'success')
    } catch (error) { reportNotificationError(error) }
  }

  const handleShutdown = () => {
    const phone = localStorage.getItem('whatsappPhone') ?? ''
    const message = buildWhatsAppSummary(history, activeStore?.name ?? 'ABElektronik')
    const target = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`

    window.open(target, '_blank', 'noopener,noreferrer')
    showToast('Ringkasan WhatsApp disiapkan', 'success')
  }

  return (
    <div className="min-h-screen text-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-white/10 bg-[#0f1725]/78 p-4 shadow-2xl backdrop-blur-2xl lg:flex">
        <button
          type="button"
          onClick={() => navigate(routes.dashboard)}
          className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-left transition hover:border-cyan-200/35 hover:bg-cyan-300/10"
        >
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-emerald-300 font-bold text-slate-950 shadow-lg shadow-cyan-300/20">
            AB
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">ABElektronik</p>
            <p className="text-xs text-white/50">Web Stock Management</p>
          </div>
        </button>

        <div className="mt-5 space-y-2">
          <p className="px-3 text-xs font-medium uppercase text-white/38">Utama</p>
          {groupedNav.utama.map((item) => (
            <NavItem key={item.path} item={item} active={isActive(location.pathname, item.path)} />
          ))}
        </div>

        <div className="mt-6 space-y-2">
          <p className="px-3 text-xs font-medium uppercase text-white/38">Laporan</p>
          {groupedNav.laporan.map((item) => (
            <NavItem key={item.path} item={item} active={isActive(location.pathname, item.path)} />
          ))}
        </div>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/52">Mode data</p>
              <Badge className={cn(mode === 'supabase' ? 'bg-emerald-300/18 text-emerald-100' : 'bg-amber-300/18 text-amber-100')}>
                {mode === 'supabase' ? 'Supabase' : 'Demo'}
              </Badge>
            </div>
            <p className="mt-2 text-sm font-medium text-white">{activeStore?.name ?? 'Belum ada toko'}</p>
          </div>
          <a
            href="https://alfajrin.dev"
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/48 transition hover:text-white"
          >
            by Al Fajrin A A (c) 2025
          </a>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101827]/75 px-4 py-3 backdrop-blur-2xl lg:fixed lg:left-72 lg:right-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Profil toko" onClick={() => navigate(routes.profile)}
            className="rounded-full outline-none ring-cyan-200/40 transition hover:ring-4"
          >
            <Avatar className="size-10">
              <AvatarImage src={profilePhoto ?? undefined} />
              <AvatarFallback className="bg-cyan-300 text-slate-950">AB</AvatarFallback>
            </Avatar>
          </button>

          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-semibold">{activeStore?.name ?? 'ABElektronik'}</p>
            <button
              type="button"
              onClick={() => activeStore?.addressLink && window.open(activeStore.addressLink, '_blank')}
              className="flex max-w-full items-center gap-1 truncate text-xs text-white/52"
            >
              <MapPin className="size-3" />
              <span className="truncate">{activeStore?.address ?? 'Alamat toko'}</span>
            </button>
          </div>

          <div className="relative hidden flex-1 lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/38" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari produk, brand, barcode"
              className="h-11 border-white/12 bg-white/[0.07] pl-10 text-white placeholder:text-white/38"
            />
            {searchResults.length ? (
              <div className="absolute left-0 right-0 top-12 z-50 rounded-xl border border-white/12 bg-[#111827]/98 p-2 shadow-2xl backdrop-blur-xl">
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setSearch('')
                      navigate(routes.products)
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-white/8"
                  >
                    <span>
                      <span className="block text-sm font-medium text-white">{product.namaBarang}</span>
                      <span className="text-xs text-white/48">{product.brand}</span>
                    </span>
                    <span className="font-mono text-xs text-cyan-100">{product.stok}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="hidden min-w-64 lg:block">
            <Select value={activeStore?.id ?? ''} onValueChange={(value) => void setActiveStore(value).catch(e => showToast(e.message, 'error'))}>
              <SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white">
                <SelectValue placeholder="Pilih toko" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Ganti tema" onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                className="hidden border-white/12 bg-white/[0.07] text-white hover:bg-white/12 sm:inline-flex"
              >
                {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Theme</TooltipContent>
          </Tooltip>

          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={notificationIssue ? 'Periksa notifikasi Android' : 'Aktifkan notifikasi Android'}
            title={notificationIssue || 'Aktifkan notifikasi Android'}
            onClick={() => void enableNotifications()}
            className={cn('relative border-white/12 bg-white/[0.07] text-white hover:bg-white/12', notificationIssue && 'border-rose-400/60')}
          >
            <Bell className="size-4" />
            {notificationIssue && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-rose-400" />}
          </Button>

          <Button aria-label="Buka scanner" variant="outline" size="icon-lg" onClick={() => setScanOpen(true)} className="lg:hidden"><ScanLine /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="hidden h-11 border-white/12 bg-white/[0.07] text-white hover:bg-white/12 lg:inline-flex"
              >
                <Store className="size-4" />
                Profil
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem aria-label="Profil toko" onClick={() => navigate(routes.profile)}><Store className="size-4" />Profil toko</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(routes.settings)}><Settings className="size-4" />Pengaturan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Ringkasan WhatsApp" onClick={handleShutdown}
            className="border-rose-300/25 bg-rose-400/10 text-rose-100 hover:bg-rose-400/18"
          >
            <Power className="size-4" />
          </Button>
        </div>
      </header>

      <Button aria-label="Buka Voice AI" onClick={() => setVoiceOpen(true)} className="fixed bottom-7 right-36 z-40 hidden h-[52px] bg-teal-700 text-white lg:inline-flex"><Mic />Voice AI</Button>
      <main className="px-4 pb-28 pt-5 lg:ml-72 lg:px-8 lg:pb-10 lg:pt-24">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.998 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <nav aria-label="Navigasi mobile" className="mobile-bottom-nav fixed inset-x-3 bottom-3 z-50 grid grid-cols-[1fr_1fr_72px_1fr_1fr] items-end rounded-t-3xl border border-white/12 bg-[#101827]/82 px-2 pb-2 pt-3 shadow-2xl backdrop-blur-2xl lg:hidden">
        {mobileNavigation.slice(0, 2).map((item) => (
          <MobileNavItem key={item.path} item={item} active={isActive(location.pathname, item.path)} />
        ))}
        <button
          type="button"
          aria-label="Buka Voice AI" onClick={() => setVoiceOpen(true)}
          className="-mt-10 -translate-y-3 flex size-16 items-center justify-center justify-self-center rounded-full bg-teal-800 text-white ring-4 ring-teal-200/25 shadow-[0_18px_45px_rgba(0,210,255,0.32)] transition-[transform,box-shadow] duration-200 hover:scale-[1.03] hover:shadow-[0_20px_50px_rgba(13,148,136,0.38)] active:scale-95"
        >
          <Mic className="size-7" />
        </button>
        {mobileNavigation.slice(2).map((item) => (
          <MobileNavItem key={item.path} item={item} active={isActive(location.pathname, item.path)} />
        ))}
      </nav>

      <Button
        type="button"
        onClick={() => setScanOpen(true)}
        className="fixed bottom-7 right-7 z-50 hidden h-[52px] rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-5 text-slate-950 shadow-[0_18px_55px_rgba(0,210,255,0.28)] hover:-translate-y-0.5 hover:shadow-[0_24px_65px_rgba(0,201,167,0.26)] lg:inline-flex"
      >
        <ScanLine className="size-5" />
        Scan
      </Button>

      <TransactionWorkflow key={activeStore?.id} scannerOpen={scanOpen} onScannerOpenChange={setScanOpen} voiceOpen={voiceOpen} onVoiceOpenChange={setVoiceOpen} />
    </div>
  )
}

function NavItem({
  item,
  active,
}: {
  item: (typeof navigationItems)[number]
  active: boolean
}) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.path}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/62 transition hover:bg-white/[0.08] hover:text-white',
        active && 'bg-cyan-300/12 text-white shadow-[0_0_28px_rgba(0,210,255,0.12)]',
      )}
    >
      <span
        className={cn(
          'absolute left-0 top-2 h-7 w-1 rounded-full bg-cyan-300 opacity-0 transition',
          active && 'opacity-100',
        )}
      />
      <Icon className={cn('size-4 transition group-hover:scale-110', active && 'text-emerald-300')} />
      <span>{item.label}</span>
    </NavLink>
  )
}

function MobileNavItem({
  item,
  active,
}: {
  item: (typeof mobileNavigation)[number]
  active: boolean
}) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.path}
      className={cn(
        'group flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[11px] text-slate-500 transition-colors duration-200 dark:text-white/50',
        active && 'text-[#0D9488] dark:text-emerald-300',
      )}
    >
      <span className="relative flex size-10 items-center justify-center rounded-2xl">
        {active ? (
          <motion.span
            layoutId="mobile-nav-active-indicator"
            className="absolute inset-0 rounded-2xl bg-[#d9f4eb] shadow-[0_7px_22px_rgba(13,148,136,0.18)] dark:bg-teal-300/15 dark:shadow-[0_8px_24px_rgba(45,212,191,0.12)]"
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          />
        ) : null}
        <Icon
          strokeWidth={active ? 2.5 : 2}
          className={cn(
            'relative z-10 size-5 transition-[color,transform] duration-200 group-hover:scale-105 group-hover:text-teal-600 dark:group-hover:text-emerald-300',
            active && 'scale-110 text-[#0D9488] dark:text-emerald-300',
          )}
        />
      </span>
      <span className={cn('transition-colors duration-200', active && 'font-semibold')}>
        {item.label}
      </span>
    </NavLink>
  )
}
