export default function GameLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Full-screen layout — no dashboard sidebar/header
  // Prevent pull-to-refresh and overscroll on mobile game screens
  return (
    <div style={{ overscrollBehavior: 'none', touchAction: 'pan-x pan-y', position: 'fixed', inset: 0, overflow: 'auto' }}>
      {children}
    </div>
  )
}
