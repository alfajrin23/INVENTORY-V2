import { Camera, CheckCircle2, Edit3, MapPin, Plus, Store, Trash2, Upload } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ErrorState } from '@/components/shared/data-state'
import { GlassPanel } from '@/components/shared/glass-panel'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { routes } from '@/lib/navigation'
import type { StoreInput, StoreRecord } from '@/lib/types'
import { cn } from '@/lib/utils'

type StoreFormState = StoreInput

const emptyStoreForm: StoreFormState = {
  name: '',
  address: '',
  addressLink: '',
  photo: '',
}

function fileToDataUrl(file: File, onLoaded: (value: string) => void) {
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      onLoaded(reader.result)
    }
  }
  reader.readAsDataURL(file)
}

export function ProfileSettingsPage() {
  const navigate = useNavigate()
  const {
    activeStore,
    stores,
    error,
    refresh,
    setActiveStore,
    addStore,
    updateStore,
    deleteStore,
  } = useInventory()
  const { showToast } = useToast()
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem('profilePhoto') ?? '')
  const [storeDialogOpen, setStoreDialogOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<StoreRecord | null>(null)
  const [storeForm, setStoreForm] = useState<StoreFormState>(emptyStoreForm)
  const [saving, setSaving] = useState(false)

  const handleProfilePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && (!file.type.startsWith('image/') || file.size > 1024 * 1024)) { showToast('Gunakan gambar maksimal 1 MB', 'error'); return }
    if (!file) {
      return
    }

    fileToDataUrl(file, (value) => {
      setProfilePhoto(value)
      localStorage.setItem('profilePhoto', value)
      showToast('Foto profil diperbarui', 'success')
    })
  }

  const handleStorePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && (!file.type.startsWith('image/') || file.size > 1024 * 1024)) { showToast('Gunakan gambar maksimal 1 MB', 'error'); return }
    if (!file) {
      return
    }

    fileToDataUrl(file, (value) => setStoreForm((current) => ({ ...current, photo: value })))
  }

  const openAddStore = () => {
    setEditingStore(null)
    setStoreForm(emptyStoreForm)
    setStoreDialogOpen(true)
  }

  const openEditStore = (store: StoreRecord) => {
    setEditingStore(store)
    setStoreForm({
      name: store.name,
      address: store.address,
      addressLink: store.addressLink,
      photo: store.photo ?? '',
    })
    setStoreDialogOpen(true)
  }

  const validateStore = () => {
    if (!storeForm.name.trim()) {
      return 'Nama toko wajib diisi'
    }

    if (!storeForm.address.trim()) {
      return 'Alamat toko wajib diisi'
    }

    if (!/^https?:\/\/.+/.test(storeForm.addressLink.trim())) {
      return 'Link lokasi harus diawali http:// atau https://'
    }

    return ''
  }

  const saveStore = async () => {
    if (saving) return
    const validation = validateStore()
    if (validation) {
      showToast(validation, 'error')
      return
    }

    setSaving(true)
    try {
      const payload: StoreInput = {
        name: storeForm.name.trim(),
        address: storeForm.address.trim(),
        addressLink: storeForm.addressLink.trim(),
        photo: storeForm.photo,
      }

      if (editingStore) {
        await updateStore(editingStore.id, payload)
        showToast('Toko diperbarui', 'success')
      } else {
        const created = await addStore(payload)
        // addStore already selects and loads the new store.
        void created
        showToast('Toko baru dibuat', 'success')
      }

      setStoreDialogOpen(false)
    } catch (storeError) {
      const message = storeError instanceof Error ? storeError.message : 'Toko gagal disimpan'
      showToast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const activateStore = async (store: StoreRecord) => {
    try {
      await setActiveStore(store.id)
      showToast(`${store.name} aktif`, 'success')
      navigate(routes.dashboard)
    } catch (e) { showToast(e instanceof Error ? e.message : 'Toko gagal dipilih', 'error') }
  }

  const removeStore = async (store: StoreRecord) => {
    const confirmed = window.confirm(`Hapus toko ${store.name}?`)
    if (!confirmed) {
      return
    }

    try { await deleteStore(store.id); showToast('Toko dihapus', 'success') }
    catch (e) { showToast(e instanceof Error ? e.message : 'Toko gagal dihapus', 'error') }
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-cyan-100/70">Store Profile</p>
        <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">Profil & Multi-Store</h1>
      </div>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <GlassPanel className="p-5" glow="cyan">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="size-20 border border-white/12">
                <AvatarImage src={profilePhoto || activeStore?.photo} />
                <AvatarFallback className="bg-cyan-300 text-xl font-bold text-slate-950">AB</AvatarFallback>
              </Avatar>
              <label className="absolute -bottom-1 -right-1 flex size-9 cursor-pointer items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-lg">
                <Camera className="size-4" />
                <input type="file" accept="image/*" className="sr-only" onChange={handleProfilePhoto} />
              </label>
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-white">{activeStore?.name ?? 'ABElektronik'}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-white/54">{activeStore?.address ?? 'Alamat toko'}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="readonlyName">Nama Toko</Label>
              <Input id="readonlyName" readOnly value={activeStore?.name ?? ''} className="border-white/12 bg-white/8 text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="readonlyAddress">Alamat Toko</Label>
              <Textarea id="readonlyAddress" readOnly value={activeStore?.address ?? ''} className="min-h-24 border-white/12 bg-white/8 text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="readonlyLink">Link Lokasi</Label>
              <Input id="readonlyLink" readOnly value={activeStore?.addressLink ?? ''} className="border-white/12 bg-white/8 text-white" />
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-5" glow="emerald">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">Daftar Toko</h2>
              <p className="text-sm text-white/52">{stores.length} toko tersimpan</p>
            </div>
            <Button type="button" onClick={openAddStore} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
              <Plus className="size-4" />
              Tambah Toko
            </Button>
          </div>

          <div className="space-y-3">
            {stores.map((store) => {
              const active = store.id === activeStore?.id
              return (
                <div
                  key={store.id}
                  className={cn(
                    'rounded-xl border bg-white/[0.055] p-4 transition',
                    active ? 'border-cyan-300/38 shadow-[0_0_30px_rgba(0,210,255,0.12)]' : 'border-white/10',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="size-12 border border-white/12">
                      <AvatarImage src={store.photo} />
                      <AvatarFallback className="bg-white/10 text-white">
                        <Store className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                    <button type="button" onClick={() => void activateStore(store)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-white">{store.name}</p>
                        {active ? <Badge className="bg-cyan-300/16 text-cyan-100">Aktif</Badge> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-white/52">
                        <MapPin className="mr-1 inline size-3" />
                        {store.address}
                      </p>
                    </button>
                    <div className="flex gap-1">
                      <Button type="button" variant="outline" size="icon-sm" aria-label={`Edit toko ${store.name}`} onClick={() => openEditStore(store)}>
                        <Edit3 className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Hapus toko ${store.name}`} onClick={() => void removeStore(store)} className="text-rose-200">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </GlassPanel>
      </section>

      <Dialog open={storeDialogOpen} onOpenChange={setStoreDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-2xl max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:rounded-t-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">{editingStore ? 'Edit Toko' : 'Tambah Toko Baru'}</DialogTitle>
            <DialogDescription className="text-white/58">
              Toko aktif dipakai untuk inventory, history, dan laporan.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.055] p-4">
            <Avatar className="size-16 border border-white/12">
              <AvatarImage src={storeForm.photo} />
              <AvatarFallback className="bg-cyan-300/12 text-cyan-100">
                <Store className="size-6" />
              </AvatarFallback>
            </Avatar>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/12 bg-white/[0.07] px-3 py-2 text-sm text-white transition hover:bg-white/12">
              <Upload className="size-4" />
              Upload Avatar
              <input type="file" accept="image/*" className="sr-only" onChange={handleStorePhoto} />
            </label>
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="storeName">Nama Toko</Label>
              <Input
                id="storeName"
                value={storeForm.name}
                onChange={(event) => setStoreForm((current) => ({ ...current, name: event.target.value }))}
                className="border-white/12 bg-white/8 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeAddress">Alamat Toko</Label>
              <Textarea
                id="storeAddress"
                value={storeForm.address}
                onChange={(event) => setStoreForm((current) => ({ ...current, address: event.target.value }))}
                className="min-h-24 border-white/12 bg-white/8 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeMap">Link Lokasi URL</Label>
              <Input
                id="storeMap"
                value={storeForm.addressLink}
                onChange={(event) => setStoreForm((current) => ({ ...current, addressLink: event.target.value }))}
                className="border-white/12 bg-white/8 text-white"
                placeholder="https://maps.google.com/..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStoreDialogOpen(false)}>
              Batal
            </Button>
            <Button type="button" onClick={() => void saveStore()} disabled={saving} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <CheckCircle2 className="size-4" />
              {saving ? 'Menyimpan' : editingStore ? 'Update' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
