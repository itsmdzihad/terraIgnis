# TerraIgnis 🔥🌍

> A satellite-powered wildfire monitoring and fire-activity analysis
> platform that harmonizes NASA FIRMS MODIS and VIIRS active-fire
> observations into a common spatial and analytical framework.

---

## Table of Contents

- [About TerraIgnis](#about-terraignis)
- [Problem](#problem)
- [Solution](#solution)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Data Pipeline](#data-pipeline)
- [Pipeline Stages](#pipeline-stages)
  - [1. FIRMS Data Ingestion](#1-firms-data-ingestion)
  - [2. Fire Data Profiling](#2-fire-data-profiling)
  - [3. H3 Spatial Aggregation](#3-h3-spatial-aggregation)
  - [4. MODIS--VIIRS Harmonization](#4-modisviirs-harmonization)
  - [5. Burn Index](#5-burn-index)
  - [6. Anomaly Detection](#6-anomaly-detection)
- [Scientific Methodology](#scientific-methodology)
- [Dataset Summary](#dataset-summary)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Running the Pipeline](#running-the-pipeline)
- [Running the FastAPI Server](#running-the-fastapi-server)
- [Running Tests](#running-tests)
- [Generated Datasets](#generated-datasets)
- [Data Schema](#data-schema)
- [API Architecture](#api-architecture)
- [API Endpoints](#api-endpoints)
- [Postman Collection](#postman-collection)
- [Data Quality & Validation](#data-quality--validation)
- [Important Limitations](#important-limitations)
- [Development Workflow](#development-workflow)
- [Future Work](#future-work)
- [Current Project Status](#current-project-status)
- [License](#license)

---

# About TerraIgnis

TerraIgnis is a wildfire-monitoring and fire-activity analysis platform
built around NASA FIRMS active-fire observations.

The system processes observations from two satellite sensor families:

- MODIS
- VIIRS

Because MODIS and VIIRS have different spatial resolutions and
observation characteristics, their observations are not treated as
directly equivalent.

TerraIgnis therefore transforms the raw observations through a
multi-stage analytical pipeline:

````text
NASA FIRMS
    ↓
Data Standardization
    ↓
Data Profiling
    ↓
H3 Spatial Aggregation
    ↓
MODIS–VIIRS Harmonization
    ↓
Burn Index
    ↓
Anomaly Detection
    ↓
FastAPI
    ↓
Next.js Frontend

The goal is to provide a consistent spatial and temporal representation of fire activity that can be visualized and explored through an interactive application.

---

# Problem

Satellite fire products provide valuable information about active fires, but different satellite sensors have different characteristics.

MODIS and VIIRS differ in:

- spatial resolution
- observation footprint
- detection characteristics
- FRP distributions
- confidence representations
- observation patterns

Therefore, directly combining raw MODIS and VIIRS observations can produce misleading results.

For example, TerraIgnis does **not** assume:

```text
1 MODIS detection = 1 VIIRS detection
````

or:

```text
MODIS FRP = VIIRS FRP
```

Instead, the system creates a common spatial framework and derives
relative sensor-normalized indicators before combining them.

---

# Solution

TerraIgnis addresses this problem through a structured processing
pipeline.

The system:

1.  Ingests NASA FIRMS MODIS and VIIRS data.
2.  Converts them into a common internal schema.
3.  Profiles and validates the data.
4.  Maps observations to H3 spatial cells.
5.  Aggregates observations by H3 cell and date.
6.  Harmonizes MODIS and VIIRS measurements.
7.  Produces a unified relative Burn Index.
8.  Detects statistically unusual fire activity.
9.  Exposes processed information through an API.
10. Provides the foundation for interactive frontend visualization.

---

# Key Features

- NASA FIRMS MODIS and VIIRS ingestion
- Common fire-observation schema
- Automated data-quality validation
- H3 spatial aggregation
- Sensor-specific metric preservation
- MODIS--VIIRS harmonization
- Relative fire-activity scoring
- 0--100 Burn Index
- Robust statistical anomaly detection
- Daily anomaly analysis
- Parquet-based analytical storage
- DuckDB/Polars analytical processing
- FastAPI data-serving layer
- Next.js frontend integration

---

# System Architecture

```text
                         NASA FIRMS
                            │
                ┌───────────┴───────────┐
                │                       │
              MODIS                   VIIRS
                │                       │
                └───────────┬───────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  Fire Ingestion  │
                  └────────┬─────────┘
                           │
                           ▼
              standardized_fires.parquet
                           │
                           ▼
                  ┌──────────────────┐
                  │ Data Profiling   │
                  └────────┬─────────┘
                           │
                           ▼
                    fire_profile.json
                           │
                           ▼
                  ┌──────────────────┐
                  │ H3 Aggregation   │
                  └────────┬─────────┘
                           │
                           ▼
                 h3_fire_daily.parquet
                           │
                           ▼
              ┌──────────────────────────┐
              │ MODIS–VIIRS              │
              │ Harmonization             │
              └────────────┬─────────────┘
                           │
                           ▼
                harmonized_fire.parquet
                           │
                           ▼
                  ┌──────────────────┐
                  │   Burn Index     │
                  └────────┬─────────┘
                           │
                           ▼
                   burn_index.parquet
                           │
                           ▼
                  ┌──────────────────┐
                  │ Anomaly Detection│
                  └────────┬─────────┘
                           │
                           ▼
                    anomalies.parquet
                           │
                           ▼
                       FastAPI
                           │
                           ▼
                     Next.js UI
```

---

# Data Pipeline

The complete analytical pipeline is:

```text
FIRMS TXT
   ↓
fire_ingestion.py
   ↓
standardized_fires.parquet
   ↓
profile_fires.py
   ↓
fire_profile.json
   ↓
build_h3_grid.py
   ↓
h3_fire_daily.parquet
   ↓
build_harmonized_fire.py
   ↓
harmonized_fire.parquet
   ↓
build_burn_index.py
   ↓
burn_index.parquet
   ↓
build_anomalies.py
   ↓
anomalies.parquet
   ↓
FastAPI
   ↓
Next.js
```

---

# Pipeline Stages

## 1. FIRMS Data Ingestion

### Purpose

The ingestion stage converts raw NASA FIRMS TXT files into a
standardized internal dataset.

### Implementation

```text
app/services/fire_ingestion.py
```

### Input

Raw NASA FIRMS files containing MODIS and VIIRS active-fire
observations.

### Output

```text
data/processed/standardized_fires.parquet
```

### Standardized Fields

The standardized schema includes fields such as:

```text
record_id
sensor
satellite
latitude
longitude
acq_date
acq_time
brightness
brightness_longwave
scan
track
confidence_raw
confidence_numeric
frp
daynight
version
source_file
```

Sensor-specific measurements are mapped into common fields while
preserving their original meaning.

### Current Dataset

```text
MODIS observations: 3,295
VIIRS observations: 32,020
Total observations: 35,315
Invalid observations: 0
```

---

# 2. Fire Data Profiling

## Purpose

Before spatial aggregation, the standardized dataset is profiled to
understand its quality and statistical characteristics.

### Implementation

```text
scripts/profile_fires.py
```

### Output

```text
data/processed/fire_profile.json
```

The profiling stage examines:

- total observations
- sensor distribution
- temporal coverage
- spatial extent
- FRP distribution
- brightness
- scan
- track
- confidence
- day/night
- null values
- duplicate records
- source files
- data-quality issues

### Temporal Coverage

```text
2026-07-28 → 2026-09-26
```

### Data Quality

The standardized dataset contained:

- 0 invalid coordinates
- 0 negative FRP values
- 0 invalid day/night values
- 0 duplicate record IDs
- 0 potential observation duplicates

---

# 3. H3 Spatial Aggregation

## Purpose

MODIS and VIIRS have different spatial resolutions.

TerraIgnis maps both sensors to a common H3 spatial grid.

### Implementation

```text
app/services/spatial.py
scripts/build_h3_grid.py
```

### H3 Resolution

Current resolution:

```text
H3 Resolution 7
```

Observations are aggregated by:

```text
h3_cell + acq_date
```

### Output

```text
data/processed/h3_fire_daily.parquet
```

### Results

```text
Input observations: 35,315

Cell/date rows: 23,244

Unique H3 cells: 8,832

Dates: 61

Coverage:
2026-07-28 → 2026-09-26
```

### Sensor Presence

```text
MODIS only: 2,069 cell/date rows
VIIRS only: 20,457 cell/date rows
Both sensors: 718 cell/date rows
```

Only:

```text
3.09%
```

of H3 cell/date rows contain detections from both sensors.

### Validation

The H3 aggregation successfully conserved:

- total observation count
- MODIS observation count
- VIIRS observation count
- MODIS FRP
- VIIRS FRP

---

# 4. MODIS--VIIRS Harmonization

## Purpose

MODIS and VIIRS measurements are not directly equivalent.

The harmonization layer converts sensor-specific measurements into
relative, unitless indicators while preserving the original sensor
information.

### Implementation

```text
app/services/harmonization.py
scripts/build_harmonized_fire.py
```

### Input

```text
data/processed/h3_fire_daily.parquet
```

### Output

```text
data/processed/harmonized_fire.parquet
```

## Method

For each sensor, an approximate footprint area is calculated:

```text
approximate footprint area =
mean_scan × mean_track
```

Then:

```text
fire density proxy =
fire count / approximate footprint area
```

and:

```text
FRP density proxy =
FRP sum / approximate footprint area
```

These values are converted into unitless empirical mid-rank indices.

### Harmonized Metrics

The dataset includes:

```text
harmonized_activity_index
harmonized_frp_index
```

along with the original sensor-specific metrics.

### Sensor Handling

For a MODIS-only cell/date:

```text
MODIS signal → available
VIIRS signal → unavailable
```

For a VIIRS-only cell/date:

```text
VIIRS signal → available
MODIS signal → unavailable
```

For both sensors:

```text
MODIS index
     +
VIIRS index
     ↓
mean of available sensor indices
```

The sensor indices are averaged rather than added to avoid automatically
doubling the score when both sensors are present.

### Important Interpretation

The harmonized indices are relative to the available dataset.

They are not:

- calibrated fire counts
- physical FRP
- burned area
- satellite-independent ground truth

---

# 5. Burn Index

## Purpose

The Burn Index combines the harmonized activity and FRP signals into a
single relative fire-activity score.

### Implementation

```text
app/services/burn_index.py
scripts/build_burn_index.py
```

### Input

```text
data/processed/harmonized_fire.parquet
```

### Output

```text
data/processed/burn_index.parquet
```

## Formula

The current formula is:

```text
Burn Index =
100 × (
    effective_activity_weight × activity_component
    +
    effective_frp_weight × frp_component
)
```

Base weights:

```text
Activity = 0.6
FRP      = 0.4
```

When both components are available:

```text
Burn Index =
100 × (
    0.6 × activity_component
    +
    0.4 × frp_component
)
```

If one component is unavailable, the available component receives the
effective full weight.

## Output Scale

```text
0 → 100
```

## Current Results

```text
Rows:    23,244
Minimum: 0.058
Mean:    49.445
Median:  48.096
P95:     90.981
Maximum: 99.969
```

## Interpretation

The Burn Index is a relative fire-activity indicator.

It is not:

- burned area
- exact fire intensity
- physical energy
- satellite-independent ground truth
- a long-term climatological index

---

# 6. Anomaly Detection

## Purpose

The anomaly layer identifies H3 cell/date observations whose Burn Index
is unusually high or low relative to other detected-fire observations on
the same date.

### Implementation

```text
app/services/anomaly.py
scripts/build_anomalies.py
```

### Input

```text
data/processed/burn_index.parquet
```

### Output

```text
data/processed/anomalies.parquet
```

---

## Why a Daily Baseline?

The current dataset covers only approximately two months.

Additionally:

```text
Median observations per H3 cell: 1
```

and:

```text
6,458 H3 cells appear on only one date
```

Therefore, a reliable per-H3 historical baseline cannot currently be
constructed.

The anomaly system therefore uses a daily robust baseline.

---

## Robust Z-Score

For each date:

```text
robust_z_score =
(
    burn_index - daily_median
)
/
(
    1.4826 × daily_MAD
)
```

Where:

```text
daily_median
```

is the daily median Burn Index and:

```text
daily_MAD
```

is the Median Absolute Deviation.

No dates in the current dataset have zero or near-zero MAD.

---

## Anomaly Thresholds

```text
robust_z < -3
    → extreme_low

-3 ≤ robust_z < -2
    → low

-2 ≤ robust_z ≤ 2
    → normal

2 < robust_z ≤ 3
    → high

robust_z > 3
    → extreme_high
```

---

## Percentile

A within-date empirical percentile is also calculated.

The percentile uses average ranks for tied values and is scaled between:

```text
0 → 1
```

Interpretation:

```text
0.0
↓
very low relative activity

0.5
↓
middle of distribution

1.0
↓
very high relative activity
```

---

## Current Anomaly Results

```text
Normal:       22,414
Low:             187
High:            628
Extreme low:       8
Extreme high:      7
```

### Example Extreme High

```text
H3:
8743aa964ffffff

Date:
2026-09-02

Burn Index:
98.634

Robust Z:
3.198

Percentile:
1.0
```

### Example Extreme Low

```text
H3:
87406cce5ffffff

Date:
2026-09-26

Burn Index:
6.075

Robust Z:
-3.286

Percentile:
0.0
```

---

# Scientific Methodology

TerraIgnis intentionally separates the analytical process into multiple
stages:

```text
Raw observation
      ↓
Standardization
      ↓
Spatial aggregation
      ↓
Sensor harmonization
      ↓
Burn Index
      ↓
Anomaly detection
```

This prevents raw MODIS and VIIRS measurements from being directly mixed
without normalization.

---

## Sensor Harmonization Principle

The system does not assume that observations from different sensors are
directly interchangeable.

Instead:

```text
MODIS observations
        ↓
sensor-specific normalization
        ↓
MODIS index

VIIRS observations
        ↓
sensor-specific normalization
        ↓
VIIRS index
```

The resulting indices can then be combined while retaining sensor
provenance.

---

## Burn Index Principle

The Burn Index uses two major signals:

```text
Fire activity
+
FRP-related signal
```

with a transparent weighting:

```text
60% activity
40% FRP
```

This weighting is a project design choice rather than a scientifically
calibrated universal weighting.

---

## Anomaly Principle

The anomaly system asks:

> Is this detected-fire H3 cell/date unusually high or low compared with
> other detected-fire observations on the same date?

It does not claim:

> The entire geographic region experienced unusual fire activity.

---

# Dataset Summary

---

Dataset Rows Purpose

---

`standardized_fires.parquet` 35,315 Standardized FIRMS observations

`h3_fire_daily.parquet` 23,244 H3 cell/date aggregation

`harmonized_fire.parquet` 23,244 MODIS--VIIRS harmonization

`burn_index.parquet` 23,244 Relative fire-activity index

`anomalies.parquet` 23,244 Statistical anomaly analysis

---

---

# Current Dataset Coverage

```text
Temporal coverage:
2026-07-28 → 2026-09-26

Number of dates:
61

Unique H3 cells:
8,832

H3 resolution:
7

Total raw detections:
35,315

MODIS:
3,295

VIIRS:
32,020
```

---

# Technology Stack

## Backend

- Python
- FastAPI
- DuckDB
- Polars
- Pandas
- PyArrow
- H3
- Pydantic

## Data Storage

The analytical datasets use:

```text
Apache Parquet
```

Parquet is suitable for this project because the workload is primarily
analytical.

Advantages include:

- columnar storage
- compression
- efficient filtering
- efficient analytical queries
- interoperability
- compatibility with DuckDB and Polars

## Spatial Framework

```text
H3
```

Current resolution:

```text
7
```

---

# Project Structure

```text
terraIgnis/
│
├── backend/
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   │
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── fires.py
│   │   │   ├── calendar.py
│   │   │   ├── anomaly.py
│   │   │   ├── regions.py
│   │   │   └── stats.py
│   │   │
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   │
│   │   ├── models/
│   │   │   └── fire.py
│   │   │
│   │   ├── schemas/
│   │   │   ├── fire.py
│   │   │   ├── calendar.py
│   │   │   ├── anomaly.py
│   │   │   ├── regions.py
│   │   │   └── stats.py
│   │   │
│   │   ├── services/
│   │   │   ├── fire_ingestion.py
│   │   │   ├── spatial.py
│   │   │   ├── harmonization.py
│   │   │   ├── burn_index.py
│   │   │   └── anomaly.py
│   │   │
│   │   └── utils/
│   │       └── dates.py
│   │
│   ├── scripts/
│   │   ├── profile_fires.py
│   │   ├── build_h3_grid.py
│   │   ├── build_harmonized_fire.py
│   │   ├── build_burn_index.py
│   │   └── build_anomalies.py
│   │
│   ├── tests/
│   │   ├── test_spatial.py
│   │   ├── test_harmonization.py
│   │   ├── test_burn_index.py
│   │   ├── test_anomaly.py
│   │   ├── test_fires_api.py
│   │   ├── test_calendar_api.py
│   │   ├── test_anomaly_api.py
│   │   ├── test_stats_api.py
│   │   └── test_regions_api.py
│   │
│   ├── data/
│   │   ├── raw/
│   │   │   ├── modis/
│   │   │   └── viirs/
│   │   │
│   │   └── processed/
│   │       ├── standardized_fires.parquet
│   │       ├── h3_fire_daily.parquet
│   │       ├── harmonized_fire.parquet
│   │       ├── burn_index.parquet
│   │       └── anomalies.parquet
│   │
│   ├── terraIgnis.postman_collection.json
│   ├── .env
│   ├── .gitignore
│   ├── requirements.txt
│   └── README.md
│
└── frontend/
```

---

# Getting Started

## Prerequisites

Make sure the following are installed:

- Python 3
- Git
- pip
- virtualenv support

---

# Installation

Clone the repository:

```bash
git clone https://github.com/itsmdzihad/terraIgnis.git
```

Move into the backend:

```bash
cd terraIgnis/backend
```

Create a virtual environment:

```bash
python3 -m venv .venv
```

Activate it:

```bash
source .venv/bin/activate
```

Upgrade pip:

```bash
pip install --upgrade pip
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

# Environment Setup

Create a `.env` file:

```text
.env
```

Example:

```env
APP_ENV=development
```

Do not commit secrets, API keys, credentials, or private configuration
values.

---

# Running the Pipeline

Run the stages in order.

## Step 1 --- Ingestion

```bash
.venv/bin/python scripts/ingest.py
```

Output:

```text
data/processed/standardized_fires.parquet
```

---

## Step 2 --- Profiling

```bash
.venv/bin/python scripts/profile_fires.py
```

Output:

```text
data/processed/fire_profile.json
```

---

## Step 3 --- H3 Aggregation

```bash
.venv/bin/python scripts/build_h3_grid.py
```

Output:

```text
data/processed/h3_fire_daily.parquet
```

---

## Step 4 --- Harmonization

```bash
.venv/bin/python scripts/build_harmonized_fire.py
```

Output:

```text
data/processed/harmonized_fire.parquet
```

---

## Step 5 --- Burn Index

```bash
.venv/bin/python scripts/build_burn_index.py
```

Output:

```text
data/processed/burn_index.parquet
```

---

## Step 6 --- Anomaly Detection

```bash
.venv/bin/python scripts/build_anomalies.py
```

Output:

```text
data/processed/anomalies.parquet
```

---

# Running the Complete Pipeline

Once all scripts are available, the complete analytical workflow is:

```bash
.venv/bin/python scripts/ingest.py

.venv/bin/python scripts/profile_fires.py

.venv/bin/python scripts/build_h3_grid.py

.venv/bin/python scripts/build_harmonized_fire.py

.venv/bin/python scripts/build_burn_index.py

.venv/bin/python scripts/build_anomalies.py
```

Each stage consumes the output of the previous stage.

---

# Running the FastAPI Server

From the `backend/` directory:

```bash
.venv/bin/uvicorn app.main:app --reload
```

The development API will be available at:

```text
http://127.0.0.1:8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

FastAPI interactive documentation:

```text
http://127.0.0.1:8000/docs
```

OpenAPI schema:

```text
http://127.0.0.1:8000/openapi.json
```

# Running Tests

Run the complete backend test suite:

```bash
.venv/bin/python -m unittest discover -s tests -v
```

Current result:

```text
131 backend tests passed
```

The test suite covers:

- FIRMS ingestion
- H3 spatial aggregation
- MODIS--VIIRS harmonization
- Burn Index
- anomaly detection
- `/api/fires`
- `/api/calendar`
- `/api/anomalies`
- `/api/anomalies/{h3_cell}`
- `/api/stats`
- `/api/regions/{h3_cell}`

---

# Generated Datasets

## `standardized_fires.parquet`

Contains standardized MODIS and VIIRS observations.

Key fields include:

```text
record_id
sensor
satellite
latitude
longitude
acq_date
acq_time
brightness
brightness_longwave
scan
track
confidence_raw
confidence_numeric
frp
daynight
version
source_file
```

---

## `h3_fire_daily.parquet`

Contains one record per:

```text
H3 cell + acquisition date
```

It preserves separate MODIS and VIIRS metrics.

---

## `harmonized_fire.parquet`

Contains:

- H3 information
- date
- MODIS metrics
- VIIRS metrics
- sensor presence
- sensor count
- normalized sensor indices
- harmonized activity
- harmonized FRP

---

## `burn_index.parquet`

Contains the unified fire-activity metric.

Important fields include:

```text
h3_cell
acq_date
harmonized_activity_index
activity_component
frp_component
activity_weight
frp_weight
burn_index
```

---

## `anomalies.parquet`

Contains statistical anomaly information.

Important fields include:

```text
h3_cell
acq_date
burn_index
daily_median
daily_mad
daily_mean
daily_std
robust_z_score
anomaly_percentile
anomaly_level
```

---

# Data Quality & Validation

The pipeline performs validation after each major processing stage.

## Ingestion

```text
Total observations: 35,315
Invalid observations: 0
```

---

## H3 Aggregation

Validation checks include:

- row representation
- sensor count conservation
- FRP conservation
- null H3 cells
- null dates
- duplicate cell/date keys
- negative values

All checks passed.

---

## Harmonization

Validation checks include:

- row conservation
- MODIS detection conservation
- VIIRS detection conservation
- FRP conservation
- duplicate cell/date keys
- null keys
- negative normalized values
- out-of-range indices

All checks passed.

---

## Burn Index

Validation checks include:

- row conservation
- MODIS/VIIRS representation
- duplicate keys
- null scores
- negative scores
- scores above 100
- formula consistency
- sensor-presence consistency

All checks passed.

---

## Anomaly Detection

Validation checks include:

- input/output row conservation
- duplicate H3/date keys
- null required fields
- percentile range
- infinite scores
- division by zero
- daily baseline consistency
- fabricated cells
- fabricated keys
- fabricated zero-fire rows

All checks passed.

---

# Data Schema

TerraIgnis keeps the analytical layers separated by purpose.

## Standardized FIRMS Observations

`standardized_fires.parquet` contains one record per standardized
satellite fire detection.

Key fields include:

```text
record_id
sensor
satellite
latitude
longitude
acq_date
acq_time
brightness
brightness_longwave
scan
track
confidence_raw
confidence_numeric
frp
daynight
version
source_file
```

## H3 Daily Aggregation

`h3_fire_daily.parquet` contains one record per observed:

```text
h3_cell + acq_date
```

The dataset preserves MODIS and VIIRS detection and FRP metrics
separately.

## Harmonized Fire Data

`harmonized_fire.parquet` contains H3/date-level sensor metrics, sensor
presence, normalized sensor indicators, and harmonized activity/FRP
indices.

## Burn Index

`burn_index.parquet` contains the unified relative fire-activity score
and its component values.

Important fields include:

```text
h3_cell
acq_date
harmonized_activity_index
activity_component
frp_component
activity_weight
frp_weight
burn_index
```

## Anomaly Data

`anomalies.parquet` contains:

```text
h3_cell
acq_date
burn_index
daily_median
daily_mad
daily_mean
daily_std
robust_z_score
anomaly_percentile
anomaly_level
```

## API Response Model

The FastAPI layer exposes these analytical datasets as typed JSON
responses through Pydantic schemas.

# API Architecture

The analytical API layer is implemented with FastAPI.

The API sits between the processed Parquet datasets and the Next.js
frontend:

```text
Processed Parquet
       │
       ▼
    DuckDB
       │
       ▼
    FastAPI
       │
       ▼
    Next.js
```

The API queries processed analytical datasets instead of recalculating
the entire pipeline for every request.

## API Data Flow

```text
NASA FIRMS
    ↓
Analytical Pipeline
    ↓
Parquet Datasets
    ↓
DuckDB
    ↓
FastAPI
    ↓
JSON API Responses
    ↓
Next.js Frontend
```

The API layer is read-only with respect to the analytical Parquet
datasets.

---

# API Endpoints

The current backend exposes the following endpoints.

## Health

### `GET /health`

Returns the API health status.

Example:

```text
GET http://127.0.0.1:8000/health
```

---

## Fires

### `GET /api/fires`

Returns paginated H3 cell/date fire-activity records.

Supported query parameters:

```text
date
start_date
end_date
h3_cell
min_burn_index
max_burn_index
sensor
limit
offset
```

Example:

```text
GET /api/fires?date=2026-09-02&limit=100
```

Sensor values supported by the current dataset/API include:

```text
MODIS
VIIRS
BOTH
```

`BOTH` represents H3 cell/date observations where both MODIS and VIIRS
are present.

---

## Calendar

### `GET /api/calendar`

Returns daily fire-activity summaries for the observed dataset.

Supported query parameters:

```text
date
start_date
end_date
anomaly_level
limit
offset
```

Returned information includes daily metrics such as:

```text
date
fire_count
mean_burn_index
max_burn_index
anomaly counts
```

Example:

```text
GET /api/calendar?start_date=2026-09-01&end_date=2026-09-26
```

---

## Anomalies

### `GET /api/anomalies`

Returns paginated anomaly records.

Supported query parameters:

```text
date
start_date
end_date
anomaly_level
h3_cell
min_robust_z
max_robust_z
min_burn_index
max_burn_index
limit
offset
```

Supported anomaly levels:

```text
normal
low
high
extreme_low
extreme_high
```

Example:

```text
GET /api/anomalies?anomaly_level=extreme_high&limit=100
```

### `GET /api/anomalies/{h3_cell}`

Returns the observed anomaly history for a specific H3 resolution-7
cell.

Optional query parameters:

```text
start_date
end_date
```

Example:

```text
GET /api/anomalies/8743aa964ffffff
```

A valid H3 cell with no observations returns an empty/not-found response
according to the API behavior. Missing dates are not fabricated.

---

## Statistics

### `GET /api/stats`

Returns a structured project-level analytical summary.

The response contains:

```text
coverage
sensors
burn_index
anomalies
```

Example:

```text
GET /api/stats
```

Current statistics include:

- total raw observations
- total H3 cell/date observations
- unique H3 cells
- observed dates
- temporal coverage
- H3 resolution
- MODIS observations
- VIIRS observations
- MODIS-only cell/date rows
- VIIRS-only cell/date rows
- both-sensor cell/date rows
- Burn Index minimum
- Burn Index maximum
- Burn Index mean
- Burn Index median
- Burn Index P95
- anomaly-level counts

---

## Regions

### `GET /api/regions/{h3_cell}`

TerraIgnis currently has no administrative-boundary dataset.

Therefore, the API uses an observed H3 resolution-7 cell as the spatial
"region" abstraction.

The endpoint returns a summary including metrics such as:

```text
h3_cell
observed_cell_dates
first_observed_date
last_observed_date
total_fire_detections
mean_burn_index
max_burn_index
min_burn_index
anomaly_count
extreme_anomaly_count
modis_fire_detections
viirs_fire_detections
```

Example:

```text
GET /api/regions/87436c709ffffff
```

Optional query parameters:

```text
start_date
end_date
```

Example:

```text
GET /api/regions/87436c709ffffff?start_date=2026-08-01&end_date=2026-09-26
```

Important semantics:

- `observed_cell_dates` counts observed H3 cell/date rows.
- `total_fire_detections` represents summed satellite fire detections.
- MODIS and VIIRS detection totals are kept separate.
- Missing dates are not fabricated.
- Valid H3 cells must be resolution 7.
- Invalid H3 identifiers or wrong-resolution H3 cells return HTTP 422.
- A valid H3 cell with no matching observations returns HTTP 404.
- Reversed date ranges return HTTP 422.

---

## API Response and Query Principles

The API:

- queries processed Parquet datasets
- uses DuckDB for analytical queries
- validates query parameters
- uses Pydantic response schemas
- returns predictable JSON structures
- supports date filtering
- supports H3 filtering
- exposes anomaly information
- preserves sensor provenance where useful
- avoids recalculating the analytical pipeline per request
- does not mutate analytical datasets
- uses pagination where appropriate

The API does not fabricate missing H3/date observations as zero-fire
records.

---

# Postman Collection

A complete Postman collection is included in the repository:

```text
backend/terraIgnis.postman_collection.json
```

The collection can be imported directly into Postman and contains
ready-to-use requests for the TerraIgnis API.

The collection includes:

```text
TerraIgnis API
├── Health
│   └── Health Check
│
├── Fires
│   ├── Get Fires
│   ├── Get Fires By Date
│   ├── Get Fires By Date Range
│   ├── Get Fires By H3 Cell
│   ├── Get Fires By Burn Index
│   ├── Get Fires By Sensor
│   └── Get Fires With Pagination
│
├── Calendar
│   ├── Get Calendar
│   ├── Get Calendar By Date
│   ├── Get Calendar By Date Range
│   └── Get Calendar High Anomalies
│
├── Anomalies
│   ├── Get Anomalies
│   ├── Get High Anomalies
│   ├── Get Extreme Anomalies
│   ├── Get Anomalies By Date
│   ├── Get Anomalies By H3 Cell
│   ├── Get Anomalies By Robust Z Score
│   ├── Get Anomaly History
│   └── Get Anomaly History By Date Range
│
├── Statistics
│   └── Get Statistics
│
└── Regions
    ├── Get Region Summary
    └── Get Region Summary By Date Range
```

### Importing the Collection

1.  Start the FastAPI server.
2.  Open Postman.
3.  Select **Import**.
4.  Choose:

```text
backend/terraIgnis.postman_collection.json
```

The collection uses these variables:

```text
base_url
h3_cell
date
start_date
end_date
```

Default development base URL:

```text
http://127.0.0.1:8000
```

Example H3 cell:

```text
87436c709ffffff
```

Example date:

```text
2026-09-02
```

The collection is intended to provide a convenient way to manually
inspect and validate all current API endpoints before frontend
integration.

# Data Quality & Validation

The pipeline performs validation after each major processing stage.

## Ingestion

```text
Total observations: 35,315
Invalid observations: 0
```

---

## H3 Aggregation

Validation checks include:

- row representation
- sensor count conservation
- FRP conservation
- null H3 cells
- null dates
- duplicate cell/date keys
- negative values

All checks passed.

---

## Harmonization

Validation checks include:

- row conservation
- MODIS detection conservation
- VIIRS detection conservation
- FRP conservation
- duplicate cell/date keys
- null keys
- negative normalized values
- out-of-range indices

All checks passed.

---

## Burn Index

Validation checks include:

- row conservation
- MODIS/VIIRS representation
- duplicate keys
- null scores
- negative scores
- scores above 100
- formula consistency
- sensor-presence consistency

All checks passed.

---

## Anomaly Detection

Validation checks include:

- input/output row conservation
- duplicate H3/date keys
- null required fields
- percentile range
- infinite scores
- division by zero
- daily baseline consistency
- fabricated cells
- fabricated keys
- fabricated zero-fire rows

All checks passed.

---

# Data Schema

TerraIgnis keeps the analytical layers separated by purpose.

## Standardized FIRMS Observations

`standardized_fires.parquet` contains one record per standardized
satellite fire detection.

Key fields include:

```text
record_id
sensor
satellite
latitude
longitude
acq_date
acq_time
brightness
brightness_longwave
scan
track
confidence_raw
confidence_numeric
frp
daynight
version
source_file
```

## H3 Daily Aggregation

`h3_fire_daily.parquet` contains one record per observed:

```text
h3_cell + acq_date
```

The dataset preserves MODIS and VIIRS detection and FRP metrics
separately.

## Harmonized Fire Data

`harmonized_fire.parquet` contains H3/date-level sensor metrics, sensor
presence, normalized sensor indicators, and harmonized activity/FRP
indices.

## Burn Index

`burn_index.parquet` contains the unified relative fire-activity score
and its component values.

Important fields include:

```text
h3_cell
acq_date
harmonized_activity_index
activity_component
frp_component
activity_weight
frp_weight
burn_index
```

## Anomaly Data

`anomalies.parquet` contains:

```text
h3_cell
acq_date
burn_index
daily_median
daily_mad
daily_mean
daily_std
robust_z_score
anomaly_percentile
anomaly_level
```

## API Response Model

The FastAPI layer exposes these analytical datasets as typed JSON
responses through Pydantic schemas.

# API Architecture

The next application layer is FastAPI.

The API will sit between the processed Parquet datasets and the Next.js
frontend.

```text
Processed Parquet
       │
       ▼
    DuckDB
       │
       ▼
    FastAPI
       │
       ▼
    Next.js
```

The API should query processed analytical datasets instead of
recalculating the entire pipeline for every request.

---

# API Design

The API is expected to expose three primary types of information.

## 1. Spatial Fire Data

Used by the map.

Example:

```text
GET /api/fires
```

Potential filters:

```text
date
bbox
h3_cell
min_burn_index
max_burn_index
```

---

## 2. Temporal Data

Used by calendar and time-series visualizations.

Example:

```text
GET /api/calendar
```

Potential information:

```text
date
fire_count
mean_burn_index
max_burn_index
anomaly_count
```

---

## 3. Anomaly Data

Used to identify unusual fire activity.

Example:

```text
GET /api/anomalies
```

Potential filters:

```text
date
anomaly_level
h3_cell
min_robust_z
```

---

# Planned API Endpoints

```text
GET /api/fires
GET /api/fires/{h3_cell}

GET /api/calendar

GET /api/anomalies
GET /api/anomalies/{h3_cell}

GET /api/stats
```

These endpoints are part of the planned FastAPI layer and may evolve
based on frontend requirements.

---

# API Principles

The API should:

- query processed datasets
- use DuckDB for analytical queries
- validate query parameters
- use Pydantic schemas
- return predictable JSON structures
- support date filtering
- support H3 filtering
- expose anomaly information
- preserve sensor provenance where useful
- avoid recalculating the data pipeline per request

The API should not mutate the analytical datasets.

---

# Important Limitations

## Limited Temporal Coverage

The current dataset covers:

```text
2026-07-28 → 2026-09-26
```

This is approximately two months.

Therefore, the current system does not provide a long-term
climatological baseline.

---

## Incomplete H3 × Date Grid

The dataset is not a complete:

```text
H3 cell × date
```

grid.

Only cell/date combinations with at least one detected fire are
represented.

Therefore:

```text
missing row
```

does not automatically mean:

```text
zero fire activity
```

---

## Limited Per-H3 History

The median H3 cell appears on only one date.

Additionally:

```text
6,458 cells
```

appear on only one date.

Therefore, reliable long-term per-cell anomaly baselines cannot
currently be constructed.

---

## Sensor Differences

MODIS and VIIRS have different sensor characteristics.

The harmonization methodology creates relative normalized indicators but
does not establish perfect physical equivalence.

---

## Burn Index Limitations

The Burn Index is a relative score.

It is not:

- burned area
- exact fire intensity
- physical energy
- satellite-independent ground truth
- universal fire severity

---

## Anomaly Limitations

The anomaly system identifies unusual observations among detected-fire
H3 cells for a date.

A low anomaly does not mean:

```text
fire-free
```

or:

```text
below-normal regional activity
```

Similarly, a high anomaly does not by itself constitute a definitive
wildfire alert.

---

# Development Workflow

Create feature branches from the main branch.

Example:

```bash
git checkout -b feature/fastapi
```

Other examples:

```text
feature/firms-ingestion
feature/h3-spatial-grid
feature/harmonization
feature/burn-index
feature/anomaly-detection
feature/fastapi
feature/frontend-integration
```

---

# Commit Convention

Recommended commit format:

```text
feat: add MODIS and VIIRS fire data ingestion
feat: add fire data profiling
feat: add H3 daily fire aggregation
feat: add MODIS VIIRS harmonization
feat: add burn index calculation
feat: add fire anomaly detection
feat: add FastAPI fire endpoints
feat: add FastAPI calendar endpoints
feat: add FastAPI anomaly endpoints
feat: add FastAPI statistics endpoints
feat: add H3 region summary endpoints
docs: add Postman API collection
```

Other prefixes:

```text
fix:
docs:
refactor:
test:
chore:
```

---

# Reproducibility

Each major processing stage has:

- dedicated implementation
- dedicated script
- validation
- unit tests
- deterministic output

The analytical pipeline can be reproduced by executing the processing
stages in order.

```bash
.venv/bin/python scripts/ingest.py

.venv/bin/python scripts/profile_fires.py

.venv/bin/python scripts/build_h3_grid.py

.venv/bin/python scripts/build_harmonized_fire.py

.venv/bin/python scripts/build_burn_index.py

.venv/bin/python scripts/build_anomalies.py
```

---

# Future Work

## Frontend Integration

The backend API layer is now complete. The next major application stage
is the Next.js frontend.

The frontend will use the API to provide:

- interactive wildfire maps
- H3 cell visualization
- Burn Index visualization
- anomaly visualization
- temporal fire calendars
- fire statistics
- H3 spatial summaries
- sensor information
- API-driven filtering

The frontend should consume the existing API rather than reimplementing
analytical calculations.

---

## Longer-Term Scientific Improvements

With a larger historical dataset, TerraIgnis could support:

- multi-year historical baselines
- seasonal anomaly detection
- per-H3 historical baselines
- temporal trend analysis
- historical fire-event tracking
- improved sensor calibration
- stronger MODIS--VIIRS cross-comparison
- regional fire-risk analysis

# Current Project Status

Component Status

---

FIRMS ingestion ✅ Complete
Data profiling ✅ Complete
H3 spatial aggregation ✅ Complete
MODIS--VIIRS harmonization ✅ Complete
Burn Index ✅ Complete
Anomaly detection ✅ Complete
FastAPI foundation ✅ Complete
`/api/fires` ✅ Complete
`/api/calendar` ✅ Complete
`/api/anomalies` ✅ Complete
`/api/anomalies/{h3_cell}` ✅ Complete
`/api/stats` ✅ Complete
`/api/regions/{h3_cell}` ✅ Complete
Postman collection ✅ Added
Backend tests ✅ 131 passing
Frontend integration ⏳ Next

# Pipeline Summary

The current TerraIgnis analytical pipeline is:

```text
┌──────────────────────────────┐
│        NASA FIRMS            │
│      MODIS + VIIRS           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Fire Ingestion          │
│   fire_ingestion.py          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ standardized_fires.parquet   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Data Profiling          │
│    profile_fires.py          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     H3 Spatial Grid          │
│    Resolution 7              │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  h3_fire_daily.parquet       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ MODIS–VIIRS Harmonization    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ harmonized_fire.parquet      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Burn Index             │
│       0 – 100                │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ burn_index.parquet           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│    Anomaly Detection         │
│   Robust Daily Baseline      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ anomalies.parquet            │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│          FastAPI             │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Next.js Frontend       │
└──────────────────────────────┘
```

---

# Conclusion

TerraIgnis provides a structured pipeline for transforming NASA FIRMS
active-fire observations into a common spatial and analytical
representation.

The system currently supports:

```text
MODIS + VIIRS
      ↓
Standardized observations
      ↓
H3 spatial aggregation
      ↓
Sensor harmonization
      ↓
Burn Index
      ↓
Anomaly detection
```

The current analytical dataset contains:

```text
35,315
raw fire observations

23,244
H3 cell/date observations

8,832
unique H3 cells

61
dates
```

The current outputs are:

```text
standardized_fires.parquet
h3_fire_daily.parquet
harmonized_fire.parquet
burn_index.parquet
anomalies.parquet
```

All major analytical stages and API endpoints have been validated
through automated tests, with the current backend test suite containing:

```text
131 passing tests
```

The FastAPI backend is now complete. The next major stage is to
integrate the API with the TerraIgnis Next.js frontend.

---

# License

Add the project's license information here.

For example:

```text
MIT License
```

or the license selected by the TerraIgnis team.
