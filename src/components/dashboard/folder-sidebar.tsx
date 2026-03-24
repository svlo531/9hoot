'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Folder } from '@/lib/types'

interface Props {
  folders: Folder[]
  activeFolderId: string | null // null = "All"
}

export function FolderSidebar({ folders, activeFolderId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Build tree from flat list
  const rootFolders = folders.filter((f) => !f.parent_folder_id)
  const childrenOf = (parentId: string) => folders.filter((f) => f.parent_folder_id === parentId)

  async function handleCreate(parentId: string | null = null) {
    const name = newName.trim()
    if (!name) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('folders').insert({
      owner_id: user.id,
      name,
      parent_folder_id: parentId,
    })

    setNewName('')
    setCreating(false)
    router.refresh()
  }

  async function handleRename(id: string) {
    const name = renameValue.trim()
    if (!name) return

    await supabase.from('folders').update({ name }).eq('id', id)
    setRenamingId(null)
    setRenameValue('')
    router.refresh()
  }

  async function handleDelete(id: string) {
    // Move quizzes in this folder back to root
    await supabase.from('quizzes').update({ folder_id: null }).eq('folder_id', id)
    // Move child folders to root
    await supabase.from('folders').update({ parent_folder_id: null }).eq('parent_folder_id', id)
    // Delete the folder
    await supabase.from('folders').delete().eq('id', id)
    setConfirmDeleteId(null)

    // If we're viewing this folder, go back to all
    if (activeFolderId === id) {
      router.push('/library')
    }
    router.refresh()
  }

  function navigateToFolder(folderId: string | null) {
    if (folderId) {
      router.push(`/library?folder=${folderId}`)
    } else {
      router.push('/library')
    }
  }

  function renderFolder(folder: Folder, depth: number) {
    const isActive = activeFolderId === folder.id
    const children = childrenOf(folder.id)
    const isRenaming = renamingId === folder.id
    const isConfirmingDelete = confirmDeleteId === folder.id

    return (
      <div key={folder.id}>
        <div
          className={`group flex items-center gap-1.5 h-8 rounded text-sm cursor-pointer transition-colors ${
            isActive
              ? 'bg-blue-cta/10 text-blue-cta font-bold'
              : 'text-dark-text hover:bg-light-gray'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '4px' }}
        >
          {isRenaming ? (
            <form
              className="flex-1 flex items-center gap-1"
              onSubmit={(e) => { e.preventDefault(); handleRename(folder.id) }}
            >
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => setRenamingId(null)}
                className="flex-1 h-6 px-1.5 text-sm border border-blue-cta rounded bg-white text-dark-text focus:outline-none"
              />
            </form>
          ) : (
            <>
              <span className="text-xs">📁</span>
              <span
                className="flex-1 truncate"
                onClick={() => navigateToFolder(folder.id)}
              >
                {folder.name}
              </span>
              <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                {depth < 2 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setCreating(true)
                      // We'll create inside this folder - store parent context
                    }}
                    className="w-5 h-5 text-[10px] text-gray-text hover:text-blue-cta rounded hover:bg-light-gray flex items-center justify-center"
                    title="Add subfolder"
                  >
                    +
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenamingId(folder.id)
                    setRenameValue(folder.name)
                  }}
                  className="w-5 h-5 text-[10px] text-gray-text hover:text-blue-cta rounded hover:bg-light-gray flex items-center justify-center"
                  title="Rename"
                >
                  ✎
                </button>
                {isConfirmingDelete ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(folder.id)
                    }}
                    onMouseLeave={() => setConfirmDeleteId(null)}
                    className="px-1.5 h-5 text-[10px] bg-red-600 text-white font-bold rounded"
                  >
                    Delete?
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDeleteId(folder.id)
                    }}
                    className="w-5 h-5 text-[10px] text-gray-text hover:text-red-600 rounded hover:bg-light-gray flex items-center justify-center"
                    title="Delete"
                  >
                    ✕
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Children */}
        {children.length > 0 && (
          <div>
            {children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-48 flex-shrink-0">
      <div className="sticky top-20">
        {/* All quizzes link */}
        <div
          onClick={() => navigateToFolder(null)}
          className={`flex items-center gap-1.5 h-8 px-2 rounded text-sm cursor-pointer transition-colors ${
            activeFolderId === null
              ? 'bg-blue-cta/10 text-blue-cta font-bold'
              : 'text-dark-text hover:bg-light-gray'
          }`}
        >
          <span className="text-xs">📋</span>
          <span>All 9Hoots</span>
        </div>

        {/* Folder list */}
        <div className="mt-1">
          {rootFolders.map((folder) => renderFolder(folder, 0))}
        </div>

        {/* Create folder */}
        {creating ? (
          <form
            className="mt-1 px-2"
            onSubmit={(e) => { e.preventDefault(); handleCreate() }}
          >
            <input
              autoFocus
              placeholder="Folder name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => { if (!newName.trim()) setCreating(false) }}
              className="w-full h-7 px-2 text-sm border border-blue-cta rounded bg-white text-dark-text placeholder:text-gray-text focus:outline-none"
            />
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 h-8 px-2 mt-1 w-full rounded text-sm text-gray-text hover:text-blue-cta hover:bg-light-gray transition-colors"
          >
            <span className="text-xs">+</span>
            <span>New folder</span>
          </button>
        )}
      </div>
    </div>
  )
}
