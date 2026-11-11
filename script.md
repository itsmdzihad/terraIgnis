# TerraIgnis Final Video Script

**NASA Space Apps Challenge 2026 · Team AstroFilos**  
**Parts 1–2 preserve the v2 narration and add detailed editing cues. Parts 3–5 contain the revised continuation.**  
**Target full-video duration:** approximately 3:40 (must remain under 3:45).  
**Continuation timecode:** 1:08–3:40.  
**Narration:** Deliver clearly at about 125–130 words per minute. Leave room for the interface and headlines to be read.

> **Accuracy note for editing:** Use a current recording of the application. Do not reuse old sample totals from earlier script drafts. If a number is shown, capture it from the live dashboard on the recording date. Future-vision concepts below are proposals, not current product features.

---

## PART 1 — THE FIRE IS REAL

### 0:00–0:40 · Hook, problem, and solution reveal

#### 0:00–0:08 · Bangladesh fire headlines

**VOICEOVER**

> “These are not just headlines. Behind every fire is a community, an ecosystem, and a life that may never be the same.”

**VISUAL / EDITOR CUES**

- Open on black for a fraction of a second; bring in a restrained flame/low rumble sound, then start the cuts on the first word.
- Rapidly cut through **`sitacundo.png` → `oldDhaka.png` → `dhakaClouthingMarket.png` → `dhakaBailyRoad.png`**. Keep each clipping for roughly 1.5–2 seconds.
- Use a gentle push-in or crop toward each headline/photo. Avoid adding extra casualty figures or claims beyond what is visible in the supplied clippings.
- Keep headlines readable at full frame; no flashy transitions. Cut on the voiceover phrase “community, an ecosystem, and a life.”

#### 0:08–0:17 · The question from orbit

**VOICEOVER**

> “But here's a critical question: when fire detections increase, does it mean more fire—or are we simply detecting it differently?”

**VISUAL / EDITOR CUES**

- Transition from the final newspaper image into a satellite view of Earth, then a neutral world map.
- Add two separate point layers that appear at different moments; label them **MODIS** and **VIIRS**. Do not show a count or imply the points are live at this point in the film.
- As the question reaches “more fire,” briefly increase the point density; on “detecting it differently,” change the sensor layer/color rather than simply multiplying every point.
- Let the question remain visually unresolved so Part 2 can build the stakes.

#### 0:17–0:27 · Why the sensors differ

**VOICEOVER**

> “NASA's MODIS and VIIRS satellites help us monitor fires across our planet. But their different spatial resolutions and detection characteristics can make direct comparisons misleading.”

**VISUAL / EDITOR CUES**

- Show a clean side-by-side sensor comparison, not a product screen: MODIS at approximately 1 km and VIIRS at approximately 375 m, if those resolution labels are retained from the v1 graphics.
- Zoom from a coarse grid to a finer grid over the same illustrative area. Clearly mark this as a visual comparison, not a claim that every fire is detected by both sensors.
- On “misleading,” briefly overlay the two layers, then separate them again.

#### 0:27–0:34 · Team AstroFilos

**VOICEOVER**

> “We are Team AstroFilos, bringing research, engineering, and interactive design together to solve this challenge.”

**VISUAL / EDITOR CUES**

- Use short clips or portraits of team members, with names and roles appearing one at a time.
- Keep faces in motion if possible: looking at a laptop, discussing a map, or reviewing a chart. Avoid a static title slide.
- Use a consistent lower-third style and finish on the full team name.

#### 0:34–0:40 · TerraIgnis reveal

**VOICEOVER**

> “Our solution is TerraIgnis—turning complex satellite fire observations into comparable data and visible patterns.”

**VISUAL / EDITOR CUES**

- Reveal the TerraIgnis logo, then a very brief, clean glimpse of the dashboard as a teaser. Keep the UI glimpse under two seconds; the actual walkthrough begins in Part 4.
- Transition out of the interface to the environmental impact story, so the video does not become a product demo too early.

---

## PART 2 — WHY THIS MATTERS

### 0:40–1:10 · Human and environmental impact

#### 0:40–0:50 · Bangladesh mangroves and land

**VOICEOVER**

> “From the Sundarbans to agricultural landscapes, fire activity can threaten biodiversity, natural resources, livelihoods, and communities.”

**VISUAL / EDITOR CUES**

- Hold **`StartsundorBon.png`** longer than the opening clippings. The supplied image refers to Sonadia mangroves; present it as a Bangladesh mangrove-fire story, not as a photograph of the Sundarbans.
- Use a slow push-in across the mangrove image, then dissolve to a simple Bangladesh map with the Sundarbans and agricultural areas highlighted as separate contextual locations.
- Keep the visual quiet and serious. Do not imply that the app classifies fire cause; that is a future direction in Part 5.

#### 0:50–1:00 · From South Asia to the world

**VOICEOVER**

> “And this challenge extends far beyond Bangladesh. Different regions experience different fire patterns, but everyone needs reliable information to understand what is changing.”

**VISUAL / EDITOR CUES**

- Build a quick geographic progression: **`nepal.png` → `southAsiaAll.png` → `indonesia.png` → `usaI.png`**.
- For **`usaI.png`**, crop to the California wildfire figures; for **`southAsiaAll.png`**, keep the date/source visible only if legible. Do not treat these clippings as current operational alerts.
- Connect each region with a thin animated route or a map zoom-out, not a claim that the events are directly comparable.
- Optional 1–2 second supporting flashes: **`usaImportant.png`** and **`humanVsNaturalFireChart.png`**. Keep labels readable; do not narrate their specific statistics.

#### 1:00–1:10 · Core question and transition

**VOICEOVER**

> “The challenge is not simply finding hotspots. It is separating meaningful changes in fire activity from differences in how satellites observe them.”

**VISUAL / EDITOR CUES**

- Let the clippings fade away into a clean MODIS/VIIRS point comparison.
- At **1:08**, bring up the text below; keep it on screen through the cut into Part 3.
- On the last word, transition directly into the TerraIgnis data-flow animation.

### 1:08–1:10 · On-screen text carried over from v2

**ON-SCREEN TEXT**  
**MORE FIRE—or DIFFERENT DETECTION?**

**VISUAL / EDITOR CUES**

- Carry the MODIS/VIIRS observation comparison from the preceding scene into this card.
- Let the question land over the map for two seconds; do not add narration here.
- Transition from the split sensor view into the TerraIgnis data-flow animation.

---

## PART 3 — THE TECHNOLOGY BEHIND TERRAIGNIS

### 1:10–1:52 · 42 seconds

#### 1:10–1:21 · From FIRMS observations to a shared grid

**VOICEOVER**

> “TerraIgnis starts with NASA FIRMS MODIS and VIIRS observations. We standardize them, group detections by H3 cell and date, and retain each sensor’s identity.”

**VISUAL / EDITOR CUES**

1. Show MODIS and VIIRS source labels entering from opposite sides. Use simple satellite icons or the sensor names; do not imply that TerraIgnis operates the satellites.
2. Show a raw observation record briefly, then a clean, shared record shape. Keep column names legible only if they come from the real data schema.
3. Animate points into H3 hexagons, then group the observations into a cell-by-date timeline.
4. Keep the MODIS and VIIRS provenance visible as separate colors or labels through the aggregation.

#### 1:21–1:33 · Harmonization, Burn Index, and anomalies

**VOICEOVER**

> “We harmonize sensor-specific signals, calculate a relative zero-to-one-hundred Burn Index, and use daily statistics to flag unusual activity.”

**VISUAL / EDITOR CUES**

1. Show MODIS and VIIRS measurements side by side, then pass them through a clearly labeled **Harmonization** step. Avoid showing them as identical raw measurements.
2. Bring up the real Burn Index legend from the map, moving from low to high. Do not imply that it is a probability or forecast.
3. Show a normal daily pattern, then highlight an anomalous point/cell. Label this **observed anomaly**, not a prediction.

#### 1:33–1:52 · Pipeline proof and transition to the product

**VOICEOVER**

> “Six processing stages turn raw files into queryable dashboard datasets. Here’s how users explore them.”

**VISUAL / EDITOR CUES**

- Flash the six real pipeline labels in order: **Ingest and standardize → Profile → H3 aggregation → MODIS/VIIRS harmonization → Burn Index → Anomaly detection**.
- Cut to the actual Fire Overview route. Use live totals captured on the recording day; avoid the outdated fixed figures in the earlier script versions.
- Hold long enough for viewers to recognize that the next section is a product walkthrough.

---

## PART 4 — FROM DATA TO EXPLORATION

### 1:52–3:10 · 78 seconds

#### 1:52–2:06 · Fire Overview

**VOICEOVER**

> “Fire Overview pairs the hotspot map with summaries of detections, active H3 cells, sensor mix, Burn Index, and activity trends.”

**VISUAL / EDITOR CUES**

- Record the real Fire Overview page at a readable desktop size. Keep the map on the left and the analysis cards on the right, as in the current layout.
- Move the cursor from the hotspot map across the detection and active-cell cards, the sensor mix, and the trend chart. Do not point at every value; the narration names the categories.
- Briefly show the map legend and the record-count/page indicator so viewers understand the map is drawing a page of records from a larger dataset.

#### 2:06–2:19 · Filters and map navigation

**VOICEOVER**

> “Filter by country, year or date, sensor, Burn Index, and H3 cell; jump to coordinates, set page size, and move through map records.”

**VISUAL / EDITOR CUES**

1. Open **Filters** and make one quick selection: country **Bangladesh**. Let the map and counts update.
2. Show the observation-period/date, sensor, minimum/maximum Burn Index, and selected H3 controls in one short sweep. Do not stop to demonstrate every combination.
3. Point out the latitude/longitude jump and the map’s page controls, including current page and remaining records. Keep the filter panel open only long enough to read the control labels.

#### 2:19–2:31 · Cell Explorer

**VOICEOVER**

> “Cell Explorer follows one H3 cell through its observed dates, sensor detections, Burn Index, and anomaly details.”

**VISUAL / EDITOR CUES**

- Switch to **Cell Explorer**; select one displayed H3 cell on the map or from the selector.
- Show the cell identifier, summary metrics, sensor counts, and burn-index history. The selected cell should be visibly highlighted.
- Keep the country selector in view briefly, then move on; the map itself should remain a real app capture.

#### 2:31–2:42 · Daily Activity

**VOICEOVER**

> “Daily Activity shows a selected year as fire counts or Burn Index; select a day to inspect its records.”

**VISUAL / EDITOR CUES**

- Open **Daily Activity**. Show the year selector, the **Fire Count / Burn Index** switch, and the calendar heatmap.
- Select one populated day and show its date and available metrics. Use a year known to contain records in the live dataset.

#### 2:42–3:00 · NRT, historical backfill, and manual files

**VOICEOVER**

> “Scheduled or on-demand near-real-time polls and resumable historical backfills bring in NASA FIRMS files. New files prompt a rebuild. Or download files manually, choose MODIS or VIIRS, batch-upload them, and generate datasets.”

**VISUAL / EDITOR CUES**

1. Open **Data Pipeline** and show the NRT scheduler status, last successful poll, and **Run NRT poll** control. Do not show a secret key or token.
2. Show the completed-download prompt: new files are saved first; the operator chooses whether to generate datasets. Briefly show the no-update state if available, to distinguish it from a new-data prompt.
3. Show the historical start/end dates and product checkboxes. Reveal the resumable chunk list and progress state; do not imply a backfill has to finish in one uninterrupted run.
4. Show the NASA FIRMS archive link, then return to the app: select a data source, choose multiple files, upload together, and press **Generate datasets**. End on the real progress/status display.

#### 3:00–3:10 · Ignish, the TerraIgnis AI agent

**VOICEOVER**

> “Ignish, TerraIgnis’s AI agent, answers questions about global or country activity using processed data. It can’t run downloads or rebuild datasets.”

**VISUAL / EDITOR CUES**

- Open Ignish from the floating launcher. Show a short prompt such as **“Summarize fire activity in Bangladesh.”**
- Display a concise answer with a cited scope/date if the live response provides it. Keep any returned counts legible and sourced from the current dataset.
- End this beat with the agent’s read-only boundary visible or stated: it answers questions; pipeline actions stay in Data Pipeline.

---

## PART 5 — THE VISION

### 3:10–3:40 · 30 seconds

**VOICEOVER**

> “Future work has three paths: combine land cover with detections to distinguish crop burning from wildfire and study satellite overpass timing or smoke and air quality; use MODIS–VIIRS overlap to research cross-sensor models and risk outlooks; and build protected-area calendars with custom boundaries, historical windows, cloud and data-gap notices, and low-bandwidth access. These are plans, not current features. TerraIgnis makes fire patterns easier to explore and understand.”

**VISUAL / EDITOR CUES**

Use a clean three-card concept sequence. Mark every card **FUTURE VISION** so viewers do not mistake proposals for live functionality.

1. **Agricultural burning vs. wildfire:** transition from the current map to a concept overlay of fire observations and land-cover classes. Add a seasonal calendar, satellite-overpass timeline, and optional smoke/AQI context. Label these as planned integrations; MODIS land cover (MCD12Q1), MERRA-2, or Sentinel-5P may appear as proposed sources, not current data feeds.
2. **Cross-sensor learning and early warning:** show overlapping MODIS/VIIRS dates feeding a conceptual model, then a clearly marked **experimental future outlook** calendar. A small callout can mention virtual VIIRS-like estimates from older MODIS observations and responder exports as research ideas.
3. **Protected-area community calendar:** show a ranger selecting a protected-area polygon or shapefile, then a historical seasonal window. Add a visible **Data unavailable / possible cloud cover** state and a low-bandwidth toggle as future concepts.
4. Close on **`Ending.png`** with a slow, restrained zoom. Fade to the TerraIgnis logo and the line **“Making fire patterns visible.”** Finish with **Team AstroFilos · NASA Space Apps Challenge 2026**.

---

## Runtime and editor checklist

- The unchanged v2 opening runs through approximately **1:10**. This replacement begins with its existing **“MORE FIRE—or DIFFERENT DETECTION?”** card and ends at **3:40**.
- Keep the full video between **3:30 and 3:45**. If the unchanged opening has a slightly different cut length, shorten silent interface holds first; keep the narration and future-vision caveat.
- Record live application footage for Fire Overview, Cell Explorer, Daily Activity, Data Pipeline, and Ignish. Use the supplied newspaper clippings for the unchanged opening/Part 2; use **`Ending.png`** for this ending.
- No fixed dashboard totals are scripted. Capture current counts during filming, and do not present proposed future features as implemented capabilities.
