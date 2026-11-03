import { useCallback, useEffect, useState } from 'react'
import { Building2, Mail, UserPlus, UserRoundMinus, Users } from 'lucide-react'

import { GlassPanel } from '@/components/shared/glass-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { databaseError, demoEnabled, requireSupabase, supabase } from '@/lib/supabase'
import type { StoreRole } from '@/lib/types'

type StoreMember = {
  store_id: string
  user_id: string
  email: string
  role: Exclude<StoreRole, 'owner'>
  active: boolean
  created_at: string
}

function roleLabel(role: StoreMember['role']) {
  return role === 'manager' ? 'Manager' : 'Kasir'
}

export function EmployeeManager() {
  const { activeStore, stores, storeRole } = useInventory()
  const { showToast } = useToast()
  const [members, setMembers] = useState<StoreMember[]>([])
  const [storeId, setStoreId] = useState(activeStore?.id ?? '')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StoreMember['role']>('cashier')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const manageableStores = stores
  const selectedStoreId = stores.some(store => store.id === storeId) ? storeId : activeStore?.id ?? ''
  const storeNames = new Map(stores.map(store => [store.id, store.name]))
  const canManage = storeRole === 'owner' || storeRole === 'manager'

  const loadMembers = useCallback(async () => {
    if (!supabase || demoEnabled || !canManage || !stores.length) {
      setMembers([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await requireSupabase().from('store_memberships')
        .select('store_id,user_id,email,role,active,created_at')
        .in('store_id', stores.map(store => store.id))
        .order('created_at', { ascending: false })
      if (error) throw databaseError(error)
      setMembers((data ?? []) as StoreMember[])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Daftar karyawan gagal dimuat.', 'error')
    } finally {
      setLoading(false)
    }
  }, [canManage, showToast, stores])

  useEffect(() => { void loadMembers() }, [loadMembers])

  const invokeMemberAction = async (body: Record<string, unknown>) => {
    const { error } = await requireSupabase().functions.invoke('manage-store-member', { body })
    if (error) {
      const context = (error as { context?: unknown }).context
      if (context instanceof Response) {
        const response = await context.clone().json().catch(() => null) as { error?: unknown } | null
        if (typeof response?.error === 'string') throw new Error(response.error)
      }
      throw new Error(error.message || 'Permintaan karyawan gagal diproses.')
    }
  }

  const invite = async () => {
    if (saving || !email.trim() || !selectedStoreId) return
    setSaving(true)
    try {
      await invokeMemberAction({ action: 'invite', storeId: selectedStoreId, email: email.trim(), role })
      setEmail('')
      showToast('Undangan email dikirim. Karyawan menetapkan password melalui tautan undangan.', 'success')
      await loadMembers()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Undangan karyawan gagal dikirim.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateMember = async (member: StoreMember, action: 'update' | 'remove', nextRole?: StoreMember['role']) => {
    if (saving) return
    if (action === 'remove' && !window.confirm(`Nonaktifkan akses ${member.email} ke ${storeNames.get(member.store_id) ?? 'cabang ini'}?`)) return
    setSaving(true)
    try {
      await invokeMemberAction({ action, storeId: member.store_id, userId: member.user_id, role: nextRole })
      showToast(action === 'remove' ? 'Akses karyawan dinonaktifkan.' : 'Role karyawan diperbarui.', 'success')
      await loadMembers()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Perubahan karyawan gagal disimpan.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) return null

  return (
    <GlassPanel className="space-y-5 p-4 sm:p-5" glow="cyan">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/10 bg-cyan-300/12 text-cyan-100">
            <Users className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white sm:text-xl">Cabang & Karyawan</h2>
            <p className="mt-0.5 text-sm text-white/55">Atur cabang dan hak akses tim Anda.</p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 sm:min-w-32 sm:flex-none">
            <Building2 className="size-4 shrink-0 text-cyan-100/70" />
            <span className="truncate text-xs text-white/65">{stores.length} cabang</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 sm:min-w-40 sm:flex-none">
            <Users className="size-4 shrink-0 text-cyan-100/70" />
            <span className="truncate text-xs text-white/65">{members.filter(member => member.active).length} akses aktif</span>
          </div>
        </div>
      </header>

      {demoEnabled ? (
        <p className="rounded-xl border border-amber-200/15 bg-amber-200/[0.06] p-3 text-sm text-amber-100/75">Manajemen karyawan tersedia setelah aplikasi terhubung ke Supabase.</p>
      ) : (
        <>
          <section aria-label="Undang karyawan" className="rounded-2xl border border-white/10 bg-slate-950/20 p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-100"><Mail className="size-4" /></div>
              <div>
                <h3 className="text-sm font-semibold text-white">Undang anggota tim</h3>
                <p className="mt-1 text-xs leading-5 text-white/50">Pilih cabang dan jabatan. Karyawan akan menerima tautan untuk mengatur password.</p>
              </div>
            </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="employee-email">Email karyawan</Label>
              <Input id="employee-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nama@contoh.com" className="h-11 w-full border-white/12 bg-white/[0.07] text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-store">Cabang</Label>
              <Select value={selectedStoreId} onValueChange={setStoreId}>
                <SelectTrigger id="employee-store" className="h-11 w-full border-white/12 bg-white/[0.07] text-white"><SelectValue placeholder="Pilih cabang" /></SelectTrigger>
                <SelectContent position="popper" className="z-[100] border-white/12 bg-[#17212b] text-white">{manageableStores.map(store => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-role">Jabatan</Label>
              <Select value={role} onValueChange={value => setRole(value as StoreMember['role'])}>
                <SelectTrigger id="employee-role" className="h-11 w-full border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" className="z-[100] border-white/12 bg-[#17212b] text-white"><SelectItem value="manager">Manager</SelectItem><SelectItem value="cashier">Kasir</SelectItem></SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={() => void invite()} disabled={saving || !email.trim() || !selectedStoreId || !manageableStores.length} className="h-11 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 lg:w-auto">
              <UserPlus className="size-4" />{saving ? 'Mengirim…' : 'Undang'}
            </Button>
          </div>
          </section>
          <p className="-mt-2 text-xs leading-5 text-white/45">Tautan undangan dikirim melalui email. Password dibuat sendiri oleh karyawan dan tidak dikirimkan melalui email.</p>

          <div className="space-y-2" aria-live="polite">
            {loading ? <p className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/55">Memuat daftar karyawan…</p> : null}
            {!loading && !members.length ? (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/[0.025] p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/45"><Users className="size-4" /></div>
                <div>
                  <p className="text-sm font-medium text-white/75">Belum ada karyawan</p>
                  <p className="mt-0.5 text-xs text-white/45">Undang karyawan untuk memberi mereka akses ke cabang.</p>
                </div>
              </div>
            ) : null}
            {members.map(member => (
              <div key={`${member.store_id}:${member.user_id}`} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
                <div className="flex size-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.055] text-sm font-semibold uppercase text-cyan-100">{member.email.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{member.email}</p>
                  <p className="mt-0.5 truncate text-xs text-white/45">{storeNames.get(member.store_id) ?? 'Cabang'} · {new Date(member.created_at).toLocaleDateString('id-ID')}</p>
                </div>
                <div className="col-start-2 flex min-w-0 items-center gap-2 sm:col-auto">
                <Badge className={member.active ? 'bg-cyan-300/14 text-cyan-100' : 'bg-white/10 text-white/55'}>{member.active ? roleLabel(member.role) : 'Nonaktif'}</Badge>
                {member.active ? <>
                  <Select value={member.role} onValueChange={value => { if (value !== member.role) void updateMember(member, 'update', value as StoreMember['role']) }}>
                    <SelectTrigger aria-label={`Role ${member.email}`} className="h-9 w-32 border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" className="z-[100] border-white/12 bg-[#17212b] text-white"><SelectItem value="manager">Manager</SelectItem><SelectItem value="cashier">Kasir</SelectItem></SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Nonaktifkan ${member.email}`} onClick={() => void updateMember(member, 'remove')} disabled={saving} className="size-9 text-rose-100 hover:bg-rose-300/10"><UserRoundMinus className="size-4" /></Button>
                </> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassPanel>
  )
}
