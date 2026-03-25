import { createClient } from '@/lib/supabase/server'
import { QuizList } from '@/components/dashboard/quiz-list'
import { FolderSidebar } from '@/components/dashboard/folder-sidebar'

export const dynamic = 'force-dynamic'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; q?: string; favorites?: string }>
}) {
  const { folder: folderId, q: search, favorites } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch folders
  const { data: folders } = await supabase
    .from('folders')
    .select('*')
    .eq('owner_id', user!.id)
    .order('name', { ascending: true })

  // Fetch quizzes - filter by folder, search, or favorites
  let quizQuery = supabase
    .from('quizzes')
    .select('*')
    .eq('owner_id', user!.id)
    .order('updated_at', { ascending: false })

  if (folderId) {
    quizQuery = quizQuery.eq('folder_id', folderId)
  }

  if (favorites === '1') {
    quizQuery = quizQuery.eq('is_favorite', true)
  }

  if (search) {
    quizQuery = quizQuery.ilike('title', `%${search}%`)
  }

  const { data: quizzes } = await quizQuery

  // Get folder name for heading
  const activeFolder = folderId ? (folders || []).find((f) => f.id === folderId) : null
  const heading = favorites === '1'
    ? 'Favorites'
    : activeFolder
    ? activeFolder.name
    : 'All 9Hoots'

  return (
    <div className="flex gap-6">
      <FolderSidebar
        folders={folders || []}
        activeFolderId={folderId || null}
        showFavorites={favorites === '1'}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-dark-text">{heading}</h1>
        </div>
        <QuizList
          quizzes={quizzes || []}
          folders={folders || []}
          initialSearch={search || ''}
        />
      </div>
    </div>
  )
}
