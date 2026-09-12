import { Bot, CalendarClock, Home, PlugZap, Settings } from 'lucide-react'
import type { FC } from 'react'
import { NavLink, useLocation } from 'react-router'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Feature } from '@/lib/browseros/capabilities'
import { NEO_ROUTES, neoCockpitUrl } from '@/lib/personal/neo-extension'
import { useNeoInstalled } from '@/lib/personal/useNeoInstalled'
import { cn } from '@/lib/utils'
import { useCapabilities } from '@/modules/browseros/capabilities.hooks'
import { SidebarHistory } from './SidebarHistory'

export interface SidebarNavigationProps {
  expanded?: boolean
  onNavigate?: () => void
}

type NavItem = {
  name: string
  to: string
  icon: typeof Home
  /** Plain link to another extension; bypasses the router. */
  href?: string
}

const neoCockpitItem: NavItem = {
  name: 'Agents',
  to: '/agents',
  href: neoCockpitUrl(NEO_ROUTES.cockpit),
  icon: Bot,
}

const primaryNavItems: NavItem[] = [
  { name: 'Home', to: '/home', icon: Home },
  neoCockpitItem,
  {
    name: 'Connect Apps',
    to: '/connect-apps',
    icon: PlugZap,
  },
  { name: 'Scheduled Tasks', to: '/scheduled', icon: CalendarClock },
  {
    name: 'Settings',
    to: '/settings/ai',
    icon: Settings,
  },
]

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/settings/ai') {
    return pathname.startsWith('/settings')
  }

  return pathname === item.to
}

export const SidebarNavigation: FC<SidebarNavigationProps> = ({
  expanded = true,
  onNavigate,
}) => {
  const location = useLocation()
  const { supports } = useCapabilities()
  const showHistory = supports(Feature.NEWTAB_CHAT_HISTORY_SUPPORT)
  const neoInstalled = useNeoInstalled()
  const navItems = primaryNavItems.filter(
    (item) => item !== neoCockpitItem || neoInstalled,
  )

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = isNavItemActive(item, location.pathname)

            const className = cn(
              'flex h-9 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-3 font-medium text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )
            const content = (
              <>
                <Icon className="size-4 shrink-0" />
                <span
                  className={cn(
                    'truncate transition-opacity duration-200',
                    expanded ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  {item.name}
                </span>
              </>
            )

            const navItem = item.href ? (
              <a href={item.href} className={className}>
                {content}
              </a>
            ) : (
              <NavLink to={item.to} onClick={onNavigate} className={className}>
                {content}
              </NavLink>
            )

            return (
              <div key={item.to}>
                {/* Expansion unmounts the content, so the trigger must own closing on pointer leave. */}
                <Tooltip disableHoverableContent>
                  <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                  {!expanded && (
                    <TooltipContent side="right">{item.name}</TooltipContent>
                  )}
                </Tooltip>
                {/* Gate the mount so non-alpha navigation never starts history queries. */}
                {item.to === '/home' && showHistory && (
                  <SidebarHistory expanded={expanded} onNavigate={onNavigate} />
                )}
              </div>
            )
          })}
        </nav>
      </div>
    </TooltipProvider>
  )
}
