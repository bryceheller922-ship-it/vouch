'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, Check, Copy, Flame, Heart, Loader2, LogOut, Pencil, School, Send, Trash2, Users, X } from 'lucide-react'
import { AvatarUploader } from '@/components/me/AvatarUploader'
import { Toast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/errors'
import { GRADE_LABEL } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import type { MyProfile } from '@/lib/types'

export function ProfileView({ profile, inviteUrl }: { profile: MyProfile; inviteUrl: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.display_name ?? '')
  const [handle, setHandle] = useState(profile.instagram_handle ?? '')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tone: 'default' | 'error' } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save() {
    const h = handle.trim().replace(/^@+/, '').toLowerCase()
    if (!/^[a-z0-9._]{1,30}$/.test(h)) return setToast({ msg: 'That doesn’t look like an Instagram handle.', tone: 'error' })
    if (!name.trim() || name.trim().length > 40) return setToast({ msg: 'Add your first name.', tone: 'error' })
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), instagram_handle: h })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      const msg = error.code === '23505' ? 'That @ is already claimed.' : friendlyError(error)
      return setToast({ msg, tone: 'error' })
    }
    setHandle(h)
    setEditing(false)
    setToast({ msg: 'Saved ✓', tone: 'default' })
    router.refresh()
  }

  async function shareInvite() {
    try {
      if (navigator.share) await navigator.share({ title: 'vouch', text: 'vote for me on vouch 👀', url: inviteUrl })
      else {
        await navigator.clipboard.writeText(inviteUrl)
        setToast({ msg: 'Invite link copied 📋', tone: 'default' })
      }
    } catch {
      /* cancelled */
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl).catch(() => {})
    setToast({ msg: 'Invite link copied 📋', tone: 'default' })
  }

  async function deleteAccount() {
    setDeleting(true)
    if (profile.avatar_url) await supabase.storage.from('avatars').remove([profile.avatar_url])
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      setDeleting(false)
      return setToast({ msg: friendlyError(error), tone: 'error' })
    }
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  const stats = [
    { label: 'Votes received', value: profile.votes_received, Icon: Heart },
    { label: 'Aura', value: profile.vote_points, Icon: Flame },
    { label: 'Friends invited', value: profile.friends_invited, Icon: Users },
  ]

  return (
    <div className="safe-top pt-2">
      <Toast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />

      <header className="flex items-center justify-between py-3">
        <h1 className="text-[34px] leading-none font-black tracking-tight">You</h1>
        {!editing && (
          <button onClick={() => setEditing(true)} className="chip py-1.5">
            <Pencil size={13} /> Edit
          </button>
        )}
      </header>

      <section className="card mt-1 flex flex-col items-center p-6 text-center">
        <AvatarUploader userId={profile.id} name={name} initialPath={profile.avatar_url} size={112} />

        {editing ? (
          <div className="mt-5 w-full space-y-2 text-left">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="First name" aria-label="First name" className="input" />
            <label className="relative block">
              <AtSign className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-mute" size={18} />
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/\s/g, ''))}
                maxLength={31}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="instagram"
                aria-label="Instagram handle"
                className="input pl-11"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  setEditing(false)
                  setName(profile.display_name ?? '')
                  setHandle(profile.instagram_handle ?? '')
                }}
                className="btn-ghost h-12 text-sm"
              >
                <X size={16} /> Cancel
              </button>
              <button onClick={save} disabled={saving} className="btn-primary h-12 text-sm">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> Save</>}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mt-4 text-2xl font-black">{name}</h2>
            <a
              href={`https://instagram.com/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-mute hover:text-white"
            >
              @{handle}
            </a>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <span className="chip">
                <School size={12} /> {profile.school_name}
              </span>
              {profile.grade && <span className="chip">{GRADE_LABEL[profile.grade]}</span>}
            </div>
          </>
        )}
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="card flex flex-col items-center gap-1 p-3 text-center">
            <Icon size={18} className="text-volt" />
            <span className="text-xl font-black tabular-nums">{value.toLocaleString()}</span>
            <span className="text-[10px] leading-tight font-bold text-mute uppercase">{label}</span>
          </div>
        ))}
      </section>

      <section className="card mt-3 p-5">
        <h3 className="font-black">Get more votes 🚀</h3>
        <p className="mt-1 text-sm text-mute">
          Every friend who joins from {profile.school_name?.split(',')[0]} earns you <span className="font-bold text-volt">+50 aura</span>,
          and more people who can vote for you.
        </p>
        <button onClick={copyInvite} className="mt-4 flex w-full items-center justify-between rounded-2xl border border-line bg-ink px-4 py-3 text-left">
          <span className="truncate text-sm font-bold">{inviteUrl.replace(/^https?:\/\//, '')}</span>
          <Copy size={16} className="shrink-0 text-mute" />
        </button>
        <button onClick={shareInvite} className="btn-primary mt-2">
          <Send size={18} strokeWidth={2.6} /> Share invite
        </button>
      </section>

      <section className="mt-3 space-y-2">
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn-ghost">
            <LogOut size={18} /> Log out
          </button>
        </form>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="btn h-12 text-sm text-mute hover:text-hot">
            <Trash2 size={16} /> Delete account
          </button>
        ) : (
          <div className="card animate-rise border-hot/50 p-4">
            <p className="text-sm font-bold">Delete your account forever?</p>
            <p className="mt-1 text-xs text-mute">Your profile, votes you cast and received, and hints are permanently erased.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost h-11 text-sm">
                Keep it
              </button>
              <button onClick={deleteAccount} disabled={deleting} className="btn h-11 bg-hot text-sm text-white">
                {deleting ? <Loader2 size={16} className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="mt-8 mb-2 text-center text-[11px] text-mute">
        {profile.email} · vouch.school
      </p>
    </div>
  )
}
