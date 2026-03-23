import { useCallback, useRef, useState } from 'react'

const DIPLOMA_ID = 'zelia-diploma-render'

function formatDate(date) {
  const d = date || new Date()
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ZeliaDiploma({ firstName, lastName, personalityType, completionDate, avatarUrl, onDownloadComplete }) {
  const diplomaRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Apprenant Zélia'
  const formattedDate = formatDate(completionDate ? new Date(completionDate) : new Date())

  const handleDownload = useCallback(async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const el = diplomaRef.current
      if (!el) return

      const { default: html2canvas } = await import('html2canvas')
      const { jsPDF } = await import('jspdf')

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 842,
        height: 595,
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH)
      pdf.save('diplome-zelia.pdf')
      if (typeof onDownloadComplete === 'function') {
        await onDownloadComplete()
      }
    } catch (err) {
      console.error('Diploma PDF download failed', err)
    } finally {
      setDownloading(false)
    }
  }, [downloading, onDownloadComplete])

  return (
    <div className="space-y-4">
      {/* Diploma visual — fixed size for PDF capture */}
      <div
        ref={diplomaRef}
        id={DIPLOMA_ID}
        style={{
          width: 842,
          height: 595,
          position: 'relative',
          overflow: 'hidden',
          background: '#ffffff',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        {/* Outer border */}
        <div style={{
          position: 'absolute', inset: 12,
          border: '3px solid #000000',
          borderRadius: 8,
        }} />
        {/* Inner border */}
        <div style={{
          position: 'absolute', inset: 20,
          border: '1px solid #c1ff72',
          borderRadius: 4,
        }} />

        {/* Top lime accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 8,
          background: 'linear-gradient(90deg, #c1ff72, #000000, #c1ff72)',
        }} />
        {/* Bottom pink accent bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 8,
          background: 'linear-gradient(90deg, #f68fff, #000000, #f68fff)',
        }} />

        {/* Corner decorations */}
        {[
          { top: 28, left: 28 },
          { top: 28, right: 28 },
          { bottom: 28, left: 28 },
          { bottom: 28, right: 28 },
        ].map((pos, i) => (
          <div key={i} style={{
            position: 'absolute', ...pos,
            width: 24, height: 24,
            backgroundColor: '#c1ff72',
            borderRadius: '50%',
            opacity: 0.5,
          }} />
        ))}

        {/* Content */}
        <div style={{
          position: 'absolute', inset: 36,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', textAlign: 'center', gap: 0,
        }}>
          {/* Header */}
          <div style={{ letterSpacing: 6, fontSize: 11, color: '#666', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif' }}>
            Plateforme d'orientation Zélia
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: '#999', fontFamily: 'Arial, sans-serif' }}>
            atteste que
          </div>

          {/* Decorative line */}
          <div style={{
            margin: '12px auto', width: 120, height: 2,
            background: 'linear-gradient(90deg, transparent, #c1ff72, transparent)',
          }} />

          {/* Title */}
          <div style={{
            fontSize: 38, fontWeight: 700, color: '#000000',
            letterSpacing: 3, lineHeight: 1.1,
          }}>
            DIPLÔME ZÉLIA
          </div>

          <div style={{
            margin: '8px auto', width: 200, height: 2,
            background: 'linear-gradient(90deg, transparent, #000000, transparent)',
          }} />

          <div style={{ fontSize: 13, color: '#555', fontStyle: 'italic', fontFamily: 'Arial, sans-serif' }}>
            Parcours d'orientation complété avec succès
          </div>

          {/* User name */}
          <div style={{
            marginTop: 22, fontSize: 30, fontWeight: 700, color: '#000000',
            fontFamily: '"Georgia", serif', fontStyle: 'italic',
          }}>
            {displayName}
          </div>

          {/* Personality archetype */}
          {personalityType && (
            <div style={{
              marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 24px', borderRadius: 30,
              background: '#000000', color: '#c1ff72',
              fontSize: 14, fontWeight: 700, fontFamily: 'Arial, sans-serif',
              letterSpacing: 1,
            }}>
              {personalityType}
            </div>
          )}

          {/* Achievement text */}
          <div style={{
            marginTop: 18, fontSize: 13, color: '#444', maxWidth: 520,
            lineHeight: 1.6, fontFamily: 'Arial, sans-serif',
          }}>
            a complété avec succès les <strong>40 niveaux</strong> du parcours d'orientation Zélia,
            démontrant engagement, curiosité et détermination dans la construction de son avenir professionnel.
          </div>

          {/* Avatar + Seal */}
          <div style={{
            marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40,
          }}>
            {/* Date */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#999', fontFamily: 'Arial, sans-serif' }}>Délivré le</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#000', marginTop: 4 }}>{formattedDate}</div>
            </div>

            {/* Seal / Badge */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              border: '3px solid #c1ff72', background: '#000000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column',
            }}>
              <div style={{ fontSize: 10, color: '#c1ff72', fontWeight: 700, fontFamily: 'Arial, sans-serif' }}>ZÉLIA</div>
              <div style={{ fontSize: 18, color: '#c1ff72', fontWeight: 900, lineHeight: 1 }}>40</div>
              <div style={{ fontSize: 8, color: '#c1ff72', fontFamily: 'Arial, sans-serif' }}>NIVEAUX</div>
            </div>

            {/* Avatar */}
            {avatarUrl && (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={avatarUrl}
                  alt=""
                  crossOrigin="anonymous"
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    border: '2px solid #c1ff72', objectFit: 'cover',
                    background: '#f0f0f0',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Download button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="px-6 py-3 rounded-xl bg-black text-[#c1ff72] font-bold text-base hover:bg-gray-900 active:scale-95 transition-all flex items-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-60"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
          </svg>
          {downloading ? 'Génération en cours…' : 'Télécharger votre diplôme'}
        </button>
      </div>
    </div>
  )
}
