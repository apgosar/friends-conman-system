import { Mail, MessageCircle } from 'lucide-react'

/** The icon of a message channel. The channel's name is written next to it, so the icon is decoration. */
export default function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'EMAIL') return <Mail aria-hidden="true" />
  if (channel === 'WHATSAPP') return <MessageCircle aria-hidden="true" />
  return null
}
