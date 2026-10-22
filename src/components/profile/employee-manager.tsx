import { useCallback, useEffect, useState } from 'react'
import { UserPlus, UserRoundMinus, Users } from 'lucide-react'

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
  const storeNames = new Map(stores.map(store => [store.id, store.name]))
  const canManage = storeRole === 'owner' || storeRole === 'manager'

  useEffect(() => {
    if (activeStore?.id && (!storeId || !stores.some(store => store.id === storeId))) setStoreId(activeStore.id)
  }, [activeStore?.id, storeId, stores])

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
    if (saving || !email.trim() || !storeId) return
    setSaving(true)
    try {
      await invokeMemberAction({ action: 'invite', storeId, email: email.trim(), role })
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
    <GlassPanel className="p-5" glow="cyan">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-xl bg-cyan-300/12 p-2 text-cyan-100"><Users className="size-5" /></div>
        <div>
          <h2 className="text-xl font-semibold text-white">Cabang & Karyawan</h2>
          <p className="text-sm text-white/52">{stores.length} cabang · {members.filter(member => member.active).length} akses karyawan aktif</p>
        </div>
      </div>

      {demoEnabled ? (
        <p className="rounded-xl border border-amber-200/15 bg-amber-200/[0.06] p-3 text-sm text-amber-100/75">Manajemen karyawan tersedia setelah aplikasi terhubung ke Supabase.</p>
      ) : (
        <>
          <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="employee-email">Email karyawan</Label>
              <Input id="employee-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nama@contoh.com" className="border-white/12 bg-white/[0.07] text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-store">Cabang</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger id="employee-store" className="border-white/12 bg-white/[0.07] text-white"><SelectValue placeholder="Pilih cabang" /></SelectTrigger>
                <SelectContent>{manageableStores.map(store => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-role">Jabatan</Label>
              <Select value={role} onValueChange={value => setRole(value as StoreMember['role'])}>
                <SelectTrigger id="employee-role" className="border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="manager">Manager</SelectItem><SelectItem value="cashier">Kasir</SelectItem></SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={() => void invite()} disabled={saving || !email.trim() || !storeId} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <UserPlus className="size-4" />{saving ? 'Mengirim…' : 'Undang'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-white/42">Karyawan menerima tautan undangan dan membuat password sendiri. Password tidak dikirim melalui email.</p>

          <div className="mt-4 space-y-2" aria-live="polite">
            {loading ? <p className="text-sm text-white/50">Memuat karyawan…</p> : null}
            {!loading && !members.length ? <p className="rounded-xl border border-dashed border-white/12 p-4 text-sm text-white/50">Belum ada karyawan yang ditambahkan.</p> : null}
            {members.map(member => (
              <div key={`${member.store_id}:${member.user_id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{member.email}</p>
                  <p className="text-xs text-white/45">{storeNames.get(member.store_id) ?? 'Cabang'} · {new Date(member.created_at).toLocaleDateString('id-ID')}</p>
                </div>
                <Badge className={member.active ? 'bg-cyan-300/14 text-cyan-100' : 'bg-white/10 text-white/55'}>{member.active ? roleLabel(member.role) : 'Nonaktif'}</Badge>
                {member.active ? <>
                  <Select value={member.role} onValueChange={value => { if (value !== member.role) void updateMember(member, 'update', value as StoreMember['role']) }}>
                    <SelectTrigger aria-label={`Role ${member.email}`} className="w-32 border-white/12 bg-white/[0.07] text-white"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="manager">Manager</SelectItem><SelectItem value="cashier">Kasir</SelectItem></SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Nonaktifkan ${member.email}`} onClick={() => void updateMember(member, 'remove')} disabled={saving} className="text-rose-100"><UserRoundMinus className="size-4" /></Button>
                </> : null}
              </div>
            ))}
          </div>
        </>
      )}
    </GlassPanel>
  )
}
