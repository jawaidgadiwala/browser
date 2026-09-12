import type { FC } from 'react'
import { Outlet } from 'react-router'
import ProductLogo from '@/assets/product_logo.svg'
import { PRODUCT_NAME } from '@/lib/personal/product'

export const AuthLayout: FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 flex flex-col items-center">
        <img src={ProductLogo} alt={PRODUCT_NAME} className="size-16" />
      </div>
      <Outlet />
    </div>
  )
}
