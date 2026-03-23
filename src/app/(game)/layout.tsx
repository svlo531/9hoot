export default function GameLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Full-screen layout — no dashboard sidebar/header
  return <>{children}</>
}
