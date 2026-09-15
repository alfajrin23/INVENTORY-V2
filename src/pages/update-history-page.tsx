import { History, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { getCurrentAppVersion, loadReleaseNotes, type ReleaseNote } from '@/lib/release-notes'

export function UpdateHistoryPage() {
  const [version, setVersion] = useState('')
  const [releases, setReleases] = useState<ReleaseNote[]>([])
  const [loading, setLoading] = useState(true)

  const load = async (force = false) => {
    setLoading(true)
    try {
      const [current, notes] = await Promise.all([getCurrentAppVersion(), loadReleaseNotes(force)])
      setVersion(current)
      setReleases(notes)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-300/14 text-violet-100">
              <Sparkles className="size-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-100/65">Pembaruan Aplikasi</p>
              <h1 className="mt-1 text-2xl font-bold text-white">Yang Baru</h1>
              <p className="mt-1 text-sm text-white/58">Versi saat ini: <strong className="text-white">{version || 'Memeriksa…'}</strong></p>
            </div>
          </div>
          <Button type="button" variant="outline" className="min-h-11 border-white/15" onClick={() => void load(true)} disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="size-4" />}
            Periksa Riwayat
          </Button>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-white/55">
          Riwayat online dibaca dari GitHub Releases yang sama dengan sistem update APK. Hasil terakhir disimpan lokal agar tetap dapat dibuka saat offline.
        </p>
      </section>

      <section className="space-y-3" aria-label="Riwayat versi Inventory V2">
        {releases.map((release, index) => (
          <article key={`${release.version}-${release.publishedAt}`} className="rounded-2xl border border-white/10 bg-[#151a22] p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <History className="size-4 text-cyan-200" />
                  <h2 className="font-bold text-white">{release.title}</h2>
                </div>
                <p className="mt-1 text-sm text-white/48">Versi {release.version}{release.version === version ? ' · Versi saat ini' : ''}</p>
              </div>
              <span className="w-fit rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-white/55">
                {release.source === 'github' ? 'GitHub Release' : 'Catatan Offline'}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {(release.summary.length ? release.summary : [release.body || 'Perbaikan stabilitas dan pengalaman pengguna.']).map(item => (
                <div key={item} className="flex gap-2 text-sm leading-6 text-white/72">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            {index === 0 ? <div className="mt-4 h-px bg-gradient-to-r from-cyan-300/30 to-transparent" /> : null}
          </article>
        ))}
        {!loading && releases.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/58">Riwayat pembaruan belum tersedia.</p>
        ) : null}
      </section>
    </div>
  )
}
