import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'

export default function Layout() {
  const location = useLocation()

  useEffect(() => {
    document.body.style.overflow = ''
  }, [location.pathname])

  return (
    <>
      <Header />
      <Outlet />
    </>
  )
}
