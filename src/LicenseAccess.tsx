import { useState } from 'react'

type LicenseAccessProps = {
  onSuccess?: (token: string) => void
}

export default function LicenseAccess({ onSuccess }: LicenseAccessProps) {
  const [license, setLicense] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleActivate() {
    const value = license.trim()

    if (!value) {
      setError('Enter your license key.')
      return
    }

    try {
      setLoading(true)
      setError('')

      const response = await fetch('/api/license/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ license: value }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'License activation failed.')
      }

      if (data.token) {
        localStorage.setItem('sq_license_token', data.token)
        onSuccess?.(data.token)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License activation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid #2e2e2e',
        background: '#080808',
        borderRadius: '8px',
        marginBottom: '1rem',
      }}
    >
      <label
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontSize: '12px',
          color: '#aaa',
        }}
      >
        License Key
      </label>

      <input
        value={license}
        onChange={(e) => setLicense(e.target.value)}
        placeholder="Enter your license key"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '0.7rem',
          background: '#111',
          border: '1px solid #333',
          color: '#fff',
          borderRadius: '5px',
        }}
      />

      <button
        type="button"
        onClick={handleActivate}
        disabled={loading}
        style={{
          width: '100%',
          marginTop: '0.7rem',
          padding: '0.7rem',
          background: '#fff',
          color: '#000',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? 'Activating...' : 'Activate License'}
      </button>

      {error && (
        <p style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  )
}
