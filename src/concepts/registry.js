// Central registry of concept MVPs. Each concept is a self-contained
// UI/UX exploration of the same gutter-estimating PRD. Add new concepts here.
import BlueprintConcept from './blueprint/BlueprintConcept.jsx'
import WizardConcept from './wizard/WizardConcept.jsx'
import DashboardConcept from './dashboard/DashboardConcept.jsx'
import TouchConcept from './touch/TouchConcept.jsx'
import StudioConcept from './studio/StudioConcept.jsx'

export const CONCEPTS = [
  {
    id: 'blueprint',
    name: 'Blueprint CAD',
    tagline: 'Engineering-grade dark canvas',
    blurb:
      'A technical, CAD-style takeoff board. Snap gutter runs onto a blueprint grid and watch linear footage, miters, and turnkey pricing compute live in an engineer-flavored side rail.',
    audience: 'Power users who think in measurements',
    accent: '#4f8cff',
    status: 'interactive',
    Component: BlueprintConcept,
  },
  {
    id: 'wizard',
    name: 'Guided Wizard',
    tagline: 'One friendly question at a time',
    blurb:
      'A step-by-step, card-based flow that walks a rep from roofline to signature with big buttons and a running total. Minimizes decisions and human error.',
    audience: 'New reps & speed-first closing',
    accent: '#34d399',
    status: 'interactive',
    Component: WizardConcept,
  },
  {
    id: 'dashboard',
    name: 'Pro Dashboard',
    tagline: 'Dense desktop estimating cockpit',
    blurb:
      'A QuickBooks-flavored multi-panel workspace: itemized line items, editable component table, and margin controls. For the office and high-volume estimators.',
    audience: 'Office / high-volume estimators',
    accent: '#f59e0b',
    status: 'interactive',
    Component: DashboardConcept,
  },
  {
    id: 'touch',
    name: 'Touch Canvas',
    tagline: 'Tablet-first, gesture-driven',
    blurb:
      'A modern iPad aesthetic with floating controls, large touch targets, and an on-site signature pad. The closest to the shipping product vision.',
    audience: 'Field reps on an iPad',
    accent: '#c084fc',
    status: 'interactive',
    Component: TouchConcept,
  },
  {
    id: 'studio',
    name: 'Proposal Studio',
    tagline: 'Document-first packet builder',
    blurb:
      'Flips the model: the deliverable is the interface. Assemble a multi-page 8.5×11 proposal — cover, diagram, marked-up site photos, manufacturer color chart, and a locked pricing/signature page — then flip to Presentation mode for the clean, customer-facing export.',
    audience: 'Reps who sell on the polished packet',
    accent: '#d97706',
    status: 'interactive',
    Component: StudioConcept,
  },
]

export const getConcept = (id) => CONCEPTS.find((c) => c.id === id)
