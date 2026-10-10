'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCampaignDraft } from '../context/CampaignDraftContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'

export function ProjectsPage() {
  const { projects: portfolioProjects } = useMediaCatalog()
  const draft = useCampaignDraft()
  const router = useRouter()
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Real Projects</h1>
          <p>Projects connected to campaign planning.</p>
        </div>
        {process.env.NEXT_PUBLIC_PORTFOLIO_URL ? (
          <a
            href={process.env.NEXT_PUBLIC_PORTFOLIO_URL}
            target="_blank"
            rel="noreferrer"
            className="btn"
          >
            Visit portfolio ↗
          </a>
        ) : null}
      </div>
      <div className="panel project-intro">
        <strong>Real product context. Proposed campaign scenarios.</strong>
        <p>
          Descriptions and website previews come from your public projects. Suggested briefs are
          editable. Seed media prices are mock. Connected players report actual browser playback.
        </p>
        <small>
          Use project brief replaces the draft name, objective and audience. Your budget, dates,
          selected media and creative stay in place.
        </small>
      </div>
      <div className="project-grid">
        {portfolioProjects.map((project) => (
          <article className="panel project-card" key={project.id}>
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="project-image"
              aria-label={`Visit ${project.name}`}
            >
              <Image
                src={project.image}
                unoptimized
                alt={`${project.name} public website preview`}
                fill
                sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw"
              />
            </a>
            <div className="project-body">
              <span className="detail-eyebrow">{project.category}</span>
              <h2>{project.name}</h2>
              <span className="status blue">{project.publicStatus}</span>
              <p>{project.description}</p>
              <ul className="project-capabilities">
                {project.capabilities.map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
              <div className="project-brief">
                <strong>Suggested campaign brief</strong>
                <p>{project.suggestedBrief.name}</p>
                <small>{project.suggestedBrief.audience}</small>
              </div>
              <div className="project-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!draft.ready}
                  onClick={() => {
                    draft.applyProject(project.id)
                    router.push('/planner')
                  }}
                >
                  Use project brief →
                </button>
                <a href={project.url} target="_blank" rel="noreferrer" className="btn">
                  Open site ↗
                </a>
              </div>
              <small className="project-source">
                Public website snapshot · {project.reviewedAt} ·{' '}
                <a href={project.url} target="_blank" rel="noreferrer">
                  Source ↗
                </a>
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
