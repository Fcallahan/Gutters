The goal of this software is to streamline the estimating process by removing unnecessary steps and eliminate as much human error as possible

1. Project Overview & Background
Drawing on 12 years of industry sales experience, this application is designed to replace manual, paper-based takeoff diagrams, fragmented photo apps, and paper contracts for Prime Seamless Gutters and Roofing.
The software allows sales representatives to visually map a property's gutter system on an iPad, dynamically calculating linear footage, component counts, waste allowances, and turnkey pricing. Furthermore, it serves as a comprehensive proposal and work-order generator—allowing reps to import site photos, annotate diagrams with custom shapes, append manufacturer color charts, and capture legally binding customer signatures on-site.
2. Target Audience & User Personas
Sales Representatives (Primary): Need a fast, touch-first iPad interface to sketch rooflines, snap and mark up site photos, present a polished proposal to San Antonio homeowners, and close the deal with an e-signature.
Installation Crews (Secondary): Rely on the generated PDF as a visual work order. They need clear annotated site photos, precise drop locations, and exact component counts (including A/B elbows, offsets, and bay miters) for fabrication.
Homeowners / Customers (Tertiary): Receive a clean, sanitized PDF export showing the diagram, annotated photos, appended color charts, the Turnkey Total, and their authorized signature.
3. Core Features & Technical Requirements
3.1. Visual Canvas Engine & Takeoff Tool
The core estimating engine remains a 2D interactive drawing board optimized for touch and Apple Pencil.
Grid & Scale: Configurable pixel-to-foot scale (default: 15px = 1ft).
Draw & Snap: Touch-and-drag to draw gutter runs. Auto-snapping to horizontal/vertical axes and existing endpoints.
Automated Geometry & Components: * Auto-calculates standard miters (75°–105°) vs. Bay Miters (e.g., 45° or 135°).
Auto-calculates End Caps based on closed vs. open loops.
Downspout parsing engine to extract complex drops (e.g., AABA 15 extracts Elbows, Offsets, and LF).
Placement tools for Valley Shields (VS).
Waste Allowances: Configurable extra linear footage added to the Total LF for fabrication waste based on the number of miters, drops, and caps.
3.2. Advanced Annotation & Shape Tools
To provide clarity for both the customer and the install crew, the canvas must support rich text and vector annotations.
Shape Library: Users can drag and drop standard vector shapes onto the canvas, including Squares, Circles, and directional Arrows.
User should be able to resize and morph shapes with a modification outline box
Custom Shapes: A polygon tool to draw freeform shapes or highlight specific roof zones.
Text Annotations: Draggable, resizable text boxes that can be placed anywhere on the canvas or over photos to type specific notes (e.g., "Requires fascia repair here", "Fascia wrap included").
3.3. Photo Import & Manipulation (Site Photos & Work Orders)
The app must act as a visual documentation tool for the job site.
Media Ingestion: Direct integration with the iPad Camera and Camera Roll to import photos directly onto the canvas or onto dedicated proposal pages.
Photo Editing: Users must be able to crop, scale, and rotate imported images.
Layer Management (Z-Index): Ability to arrange photos (bring to front, send to back) and place them alongside or behind vector drawings.
Markup: The ability to use the drawing and annotation tools (arrows, text, freehand lines) directly on top of the imported photos to highlight rot, water damage, or specific downspout routing for the installers.
3.4. Document Management & PDF Import
The proposal needs to be a self-contained, all-in-one packet.
PDF Appending: The ability to import external PDF files and append specific pages to the final generated proposal.
Use Case: Seamlessly attaching standard manufacturer color charts (e.g., Senox, Spectra), warranty information, or company liability waivers to the end of the customer's quote.
3.5. E-Signature & Contract Execution
The app must transition an estimate into a closed, legally actionable contract.
Signature Pad: A dedicated touch-target area for the customer to sign using their finger or an Apple Pencil.
Terms & Conditions: A scrollable text block containing the Prime Seamless standard contract terms that the customer agrees to upon signing.
Document Locking: Once the signature is captured and saved, the pricing, itemized totals, and contract terms must be locked to prevent unauthorized post-signature modifications.
3.6. Automated Calculations & PDF Generation
Live Estimate: Real-time multiplication of adjusted Material LF by the Price Per LF, plus Misc/Labor fees, resulting in a Turnkey Total.
Dynamic Presentation Export: A one-click export that hides all internal UI, waste allowances, and margin data. It complies the annotated canvas, marked-up site photos, the locked Turnkey Total, the customer signature, and appended color charts into a single, high-resolution 8.5x11 PDF.
4. Technical Architecture Guidelines for the Dev Team
Tech Stack Recommendation: Given the iPad requirement and need for robust photo/PDF handling, a framework like React Native (using react-native-skia or react-native-canvas for drawing) or Flutter is highly recommended over a simple web wrapper. Alternatively, native Swift/iPadOS development.
Local Storage vs. Cloud: The app must be offline-capable (for areas with poor cellular service) using SQLite or Realm, with background syncing to a cloud database (Firebase, AWS, or custom Node/PostgreSQL backend) once a connection is re-established.
PDF Generation Library: Recommend using robust native PDF libraries (like PDFKit on iOS or pdf-lib in JS) to ensure high-quality photo rendering and proper document appending.


