'use client'
import Link from 'next/link'
import { useMediaCatalog } from '../context/MediaCatalogContext'
export function AudiencePage() {
  const { inventory, ready } = useMediaCatalog()
  return (
    <section className="page pg-page">
      <div className="page-head">
        <div>
          <p className="pg-eyebrow">DATA</p>
          <h1>Audience</h1>
          <p>Audience estimates supplied in the inventory catalog, with an explicit source.</p>
        </div>
        <Link className="btn" href="/data">
          Manage data connections
        </Link>
      </div>

      <div className="panel pg-form">
        <h2>Audience measurement</h2>
        <p className="demo-note">
          No audience measurement provider is connected. Screen playback and programmatic
          impressions do not automatically establish unique reach, demographics or store visits.
        </p>
      </div>
      <div className="panel pg-table-wrap">
        <h2>Inventory audience metadata</h2>
        {!ready ? (
          <p role="status">Loading inventory…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Placement</th>
                <th>Area</th>
                <th>Reported estimate</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/inventory/${i.id}`}>{i.name}</Link>
                  </td>
                  <td>{i.area}</td>
                  <td>{i.reach || 'Not supplied'}</td>
                  <td>
                    <span className="pg-badge">
                      {i.dataSource === 'mock'
                        ? 'Mock inventory metadata'
                        : i.dataSource === 'real'
                          ? 'Imported inventory metadata'
                          : 'Unspecified metadata source'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
