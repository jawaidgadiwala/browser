import { Globe } from 'lucide-react'
import { type FC, useState } from 'react'
import { cn } from '@/lib/utils'
import { faviconUrl } from '@/modules/sidebar/favicon'

export interface FaviconProps {
  url: string
  liveIcon?: string
  className?: string
}

export const Favicon: FC<FaviconProps> = ({ url, liveIcon, className }) => {
  const [failed, setFailed] = useState(0)
  const sources = [faviconUrl(url), liveIcon].filter(
    (source): source is string => Boolean(source),
  )
  const src = sources[failed]

  if (!src) {
    return <Globe className={cn('size-4 shrink-0 opacity-60', className)} />
  }

  return (
    <img
      key={src}
      src={src}
      alt=""
      aria-hidden
      onError={() => setFailed((index) => index + 1)}
      className={cn('size-4 shrink-0 rounded-sm', className)}
    />
  )
}
