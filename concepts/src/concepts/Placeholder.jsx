// Shared placeholder shown for concepts not yet implemented.
// Each planned concept renders this with its own copy so the gallery
// stays navigable and visually distinct while iterations fill them in.
export default function Placeholder({ name, description }) {
  return (
    <div className="placeholder">
      <div className="placeholder__card">
        <span className="placeholder__badge">Concept preview</span>
        <h2>{name}</h2>
        <p>{description}</p>
        <p style={{ marginTop: 18, fontSize: 13 }}>
          This direction is sketched in the gallery and will be built out in an
          upcoming pass. Use the switcher above to compare with the interactive concepts.
        </p>
      </div>
    </div>
  )
}
