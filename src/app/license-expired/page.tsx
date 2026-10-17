export default function LicenseExpiredPage() {
  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <h1 className="auth-title mb-3">License expired</h1>
        <p className="text-secondary mb-2">
          This deployment&apos;s license could not be verified, has expired, or is not valid for this domain.
        </p>
        <p className="text-secondary m-0">Contact your Neev CMS vendor to renew access.</p>
      </div>
    </div>
  )
}
