export default function LicenseExpiredPage() {
  return (
    <div
      className="flex items-center justify-center p-6 text-center" style={{ minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}
    >
      <div style={{ maxWidth: 480 }}>
        <h1 className="mb-3" style={{ fontSize: 24 }}>License expired</h1>
        <p className="mb-2" style={{ color: '#555' }}>
          This deployment&apos;s license could not be verified, has expired, or is not valid for this domain.
        </p>
        <p style={{ color: '#555' }}>Contact your Neev CMS vendor to renew access.</p>
      </div>
    </div>
  )
}
