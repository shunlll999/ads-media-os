'use client'

import Link from 'next/link'
import { useCampaignDraft } from './context/CampaignDraftContext'
import { useMediaCatalog } from './context/MediaCatalogContext'

export function ProjectSource() {
  const draft = useCampaignDraft()
  const { projects } = useMediaCatalog()
  const project = projects.find((project) => project.id === draft.sourceProjectId)
  return (
    <div className="project-source-brief">
      {project ? (
        <>
          <strong>Project: {project.name}</strong>
          <p>Real product · Proposed campaign scenario</p>
          <a href={project.url} target="_blank" rel="noreferrer">
            View source ↗
          </a>
          {' · '}
          <Link href="/projects">Change project</Link>
        </>
      ) : (
        <Link href="/projects">Start with one of your real projects →</Link>
      )}
    </div>
  )
}
