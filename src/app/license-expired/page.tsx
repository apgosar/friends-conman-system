export default function LicenseExpiredPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>License expired</h1>
        <p style={{ color: '#555', marginBottom: 8 }}>
          This deployment&apos;s license could not be verified, has expired, or is not valid for this domain.
        </p>
        <p style={{ color: '#555' }}>Contact your Neev CMS vendor to renew access.</p>
      </div>
    </div>
  )
}
