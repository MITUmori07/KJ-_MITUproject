// V1.0.0
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function safeRedirect(r: string | null): string {
  if (!r || !r.startsWith('/') || r.startsWith('//')) return '/history'
  return r
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = safeRedirect(searchParams.get('redirect'))

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.replace(redirect)
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'ログインに失敗しました')
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <form
        onSubmit={handleSubmit}
        style={{ width: '100%', maxWidth: 360, padding: 32, background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>KJM</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          autoFocus
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, marginBottom: 12, boxSizing: 'border-box' }}
        />
        {error && <p style={{ color: '#d33', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          style={{ width: '100%', padding: '10px 12px', border: 'none', borderRadius: 8, background: loading ? '#999' : '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >
          {loading ? '確認中…' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
