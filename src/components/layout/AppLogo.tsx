import Image from 'next/image'

/** The Neev CMS mark. It is the same file as the browser tab icon, which the brand kit draws for sizes up to 48 px. */
export default function AppLogo({ className }: { className: string }) {
  return <Image src="/icon.svg" alt="" width={44} height={44} className={className} priority />
}
