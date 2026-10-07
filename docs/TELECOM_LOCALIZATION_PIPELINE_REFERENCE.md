# E-Rakshak Telecom Multi-Lateration & Geolocation Engine
## Comprehensive Technical Blueprint & Mathematical Specification

> **Classification:** Law Enforcement Sensitive / Cyber Crime Investigation  
> **Target Domain:** Telecom Cellular Triangulation, Fugitive Tracking & Signal Forensics  
> **Reference Standard:** 3GPP Cellular Standards, WGS84 Geodetic Datum, Section 65B Indian Evidence Act  

---

## 1. Executive Pipeline Architecture

The E-Rakshak pipeline transforms disparate, coarse, and messy telecom operator records into high-precision, court-admissible suspect position estimates. The end-to-end lifecycle executes across six deterministic stages:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            1. INGESTION & AUDIT                              │
│  CSV / XLSX / XLS / TSV Upload ➔ SHA-256 Hash ➔ Operator / Dump Auto-Detect  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         2. VALIDATION & NORMALIZATION                        │
│  Schema Validation ➔ Field Normalization ➔ Tower Registry DB Join / Cache    │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          3. FRAME BUILDING & PRE-FILTER                      │
│  Time-Clustering Window (Δt ≤ 60s) ➔ Serving + Neighbor Cells Assembly       │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    4. STAGE 1: JPL NON-LINEAR MULTILATERATION                │
│  UTM Projection ➔ Initial Sector Intersection ➔ Iterative WLS + Huber NLOS   │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     5. STAGE 2: KINEMATIC KALMAN TRACKER                     │
│  Adaptive Q_k & R_k ➔ Mahalanobis Gating (Rogue BTS Detection) ➔ Joseph P_k  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              6. PROBABILITY DENSITY HEATMAP & FORENSIC EXPORTS               │
│  Metric Lattice Grid ➔ Joint Likelihood Density ➔ CSV / KML / PDF (Sec 65B)  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Ingestion Layer & Failure Handling Matrix

### 2.1 Supported Operators & File Formats
The system ingests cellular telemetry from India's four major Telecom Service Providers (TSPs) across heterogeneous formats:
* **Reliance Jio**: LTE/5G dumps containing eNodeB IDs, Cell IDs, Timing Advance (TA in steps of 0.5 to 1), RTT, and RSRP/RSRQ.
* **Bharti Airtel**: 2G/4G CDR formats containing LAC, Cell ID, CGI (`404-45-xxx-xxx`), TA index, and call duration.
* **Vodafone Idea (Vi)**: Multi-operator merged format with MCC-MNC combinations (`404-20`, `404-04`).
* **BSNL**: Legacy GSM/3G CDR format containing BTS LAC, Cell ID, and call type classifications.
* **Spot Dumps**: High-density IMEI/IMSI dumps captured at a crime scene over a specific timestamp window.
* **Tower Master Dumps**: Physical cell site records containing latitude, longitude, antenna azimuth ($\theta$), beamwidth ($\beta$), and tower height.

---

### 2.2 Ingestion Failure Modes & Resilience Handling

| Failure Scenario | How the Pipeline Detects It | Handling & Recovery Action | Error Code / Audit Trail |
| :--- | :--- | :--- | :--- |
| **Duplicate File Upload** | Computes cryptographic **SHA-256** checksum over the file byte stream prior to parsing. | Rejects ingestion immediately. Preserves database deduplication; returns pointer to the prior upload. | `400 Bad Request` (`DuplicateUploadError`) |
| **Missing Required Columns** | `TelecomFileDetector` performs regex signature matching against headers. | If no known operator header pattern matches with $\ge 60\%$ confidence, falls back to fuzzy alias resolution; if still unresolved, aborts before dirty DB writes. | `422 Unprocessable Entity` (`UnknownFormatError`) |
| **Corrupted / Incomplete Rows** | `IngestionValidator` parses row by row with Pydantic boundary checks. | Bad rows are isolated into a `rejected_records` quarantine table; valid rows in the same batch continue processing. | Warning logged in `audit_logs` |
| **Timezone Drift / Corrupt Timestamps** | `datetime_utils` parser supports multi-format strings (`YYYY-MM-DD HH:MM:SS`, ISO 8601, Epoch ms). | Automatically normalizes timestamps to Indian Standard Time (IST / UTC+05:30). Unparseable rows rejected. | Normalized to naive IST datetime |
| **Invalid or Malformed CGI** | Regex validation checks format `MCC-MNC-LAC-CellID` (e.g. `404-20-100-5401`). | Missing components attempt resolution from carrier master DB; unresolvable CGIs rejected. | Field flagged in rejected record log |
| **Server-Side Request Forgery (SSRF) on URL Upload** | `_assert_public_url` inspects URL scheme and resolves DNS host against IP address tables. | Rejects loopback (`127.0.0.1`), private RFC1918 subnets (`10.x`, `192.168.x`, `172.16.x`), link-local, and multicast addresses. | `ValueError("Blocked URL host")` |
| **Payload Size Exceeded** | Streaming size inspection compares against `MAX_CONTENT_LENGTH_MB` (default 50 MB). | Terminate upload stream and cleans up temporary files in `/tmp` immediately. | `413 Payload Too Large` |

---

## 3. Data Normalization & Frame Assembly

### 3.1 Normalization Schema (`SubscriberEventRecord`)
All operator formats are normalized into an immutable canonical contract:
* `subscriber_id`: Normalized phone number (E.164), IMEI, or IMSI.
* `timestamp`: High-precision IST datetime.
* `cgi`: Global Cell Identity (`MCC-MNC-LAC-CI`).
* `timing_advance`: Cellular Timing Advance index ($0 \le \text{TA} \le 63$).
* `rtt`: Round Trip Time in milliseconds.
* `signal_strength`: Received Signal Strength Indication (RSSI in dBm) or RSRP.

### 3.2 Time-Clustering Window & Measurement Frames
A single tower observation cannot uniquely locate a suspect. The pipeline clusters asynchronous network observations into synchronous **`MeasurementFrame`** snapshots:
1. All event records for target subscriber $S$ are sorted chronologically: $t_1, t_2, \dots, t_N$.
2. Events falling within a sliding window $\Delta t_{\text{cluster}} \le 60\text{ seconds}$ are clustered into a single frame.
3. The cluster is joined with the `TowerRecord` table to retrieve tower coordinates $(\text{Lat}_i, \text{Lon}_i)$, sector azimuth ($\theta_i$), and beamwidth ($\beta_i$).
4. **Constraint Check**: If a frame contains fewer than **3 distinct tower observations**, it is flagged as `FrameStatus.INSUFFICIENT` for 2D trilateration, falling back to a single-tower sector wedge approximation.

---

## 4. Stage 1: Cheung & Lee (JPL) Multi-Lateration Engine

### 4.1 Geodetic to Projected Metric Coordinate Conversion
Calculations cannot be performed in raw degrees due to meridian convergence. WGS84 geographic coordinates $(\phi, \lambda)$ are projected into **Universal Transverse Mercator (UTM)** metric coordinates $(E, N)$ using the Karney formulation:
$$\text{GISUtils.latlon\_to\_utm}(\phi, \lambda) \longrightarrow (x_i, y_i) \text{ in meters (UTM Zone 43N for Gujarat)}$$

---

### 4.2 Pseudorange & Timing Advance Derivation
Timing Advance represents the round-trip radio propagation delay between the Mobile Station (MS) and Base Transceiver Station (BTS). The derived one-way pseudorange distance $\rho_i$ is computed as:

$$\rho_i = \text{TA}_i \times \Delta r_{\text{step}}$$

* **GSM**: $\Delta r_{\text{step}} = \frac{c \times T_{\text{bit}}}{2} \approx \frac{3 \times 10^8 \times 3.69 \times 10^{-6}}{2} \approx 553.5\text{ meters per TA unit}$.
* **LTE (3GPP TS 36.211)**: $\Delta r_{\text{step}} = 16 \times T_s \times \frac{c}{2} \approx 78.12\text{ meters per TA unit}$.

The annular uncertainty interval is bounded by:
$$r_{\text{inner}} = \max\left(0, (\text{TA} - 0.5) \times \Delta r_{\text{step}}\right), \quad r_{\text{outer}} = (\text{TA} + 0.5) \times \Delta r_{\text{step}}$$
The 1-sigma measurement uncertainty is set to the half-width: $\sigma_i = \frac{r_{\text{outer}} - r_{\text{inner}}}{2}$.

---

### 4.3 Mathematical Formulation: Iterative Weighted Least Squares (WLS)

Let target position be $\mathbf{x} = [x, y]^T$ and receiver clock bias in meters be $b$.  
The state vector is:
$$\mathbf{P} = \begin{bmatrix} x \\ y \\ b \end{bmatrix} \in \mathbb{R}^{3 \times 1}$$

The non-linear observation equation for tower $i \in \{1, \dots, N\}$ is:
$$\rho_i = \|\mathbf{x} - \mathbf{s}_i\| + b + e_i = \sqrt{(x - x_i)^2 + (y - y_i)^2} + b + e_i$$
where $\mathbf{s}_i = [x_i, y_i]^T$ is the known coordinate of tower $i$, and $e_i \sim \mathcal{N}(0, \sigma_i^2)$ is measurement noise.

#### 1. Linearization via Taylor Series Expansion
Linearizing around current estimate $\mathbf{P}^{(k)} = [x^{(k)}, y^{(k)}, b^{(k)}]^T$:
$$\Delta \mathbf{P} = \mathbf{P} - \mathbf{P}^{(k)}$$
The unit line-of-sight vector from tower $i$ to the estimate is:
$$\mathbf{u}_i^{(k)} = \frac{\mathbf{P}_{xy}^{(k)} - \mathbf{s}_i}{\|\mathbf{P}_{xy}^{(k)} - \mathbf{s}_i\|}$$
The Jacobian geometry matrix $\mathbf{A} \in \mathbb{R}^{N \times 3}$ is constructed as:
$$\mathbf{A} = \begin{bmatrix}
-\mathbf{u}_1^T & 1 \\
-\mathbf{u}_2^T & 1 \\
\vdots & \vdots \\
-\mathbf{u}_N^T & 1
\end{bmatrix} = \begin{bmatrix}
-\frac{x^{(k)} - x_1}{d_1} & -\frac{y^{(k)} - y_1}{d_1} & 1 \\
-\frac{x^{(k)} - x_2}{d_2} & -\frac{y^{(k)} - y_2}{d_2} & 1 \\
\vdots & \vdots & \vdots \\
-\frac{x^{(k)} - x_N}{d_N} & -\frac{y^{(k)} - y_N}{d_N} & 1
\end{bmatrix}$$
where $d_i = \|\mathbf{P}_{xy}^{(k)} - \mathbf{s}_i\|$.

#### 2. Pseudorange Residual Vector
The residual vector $\mathbf{d} \in \mathbb{R}^{N \times 1}$ is:
$$d_i = \rho_i - \left(d_i^{(k)} + b^{(k)}\right)$$

#### 3. Weighting Matrix $\mathbf{W}$ & Huber Robust NLOS Mitigation
Urban environments suffer from Non-Line-Of-Sight (NLOS) multipath delays. The engine applies an adaptive Huber M-estimator.
The base inverse-variance weighting matrix is:
$$\mathbf{W}_{\text{base}} = \text{diag}\left(\frac{1}{\sigma_1^2}, \frac{1}{\sigma_2^2}, \dots, \frac{1}{\sigma_N^2}\right)$$
For each tower, the Huber robust scale factor $w_i^{\text{Huber}}$ downweights large residuals:
$$w_i^{\text{Huber}} = \begin{cases}
1.0 & \text{if } |d_i| \le \tau_i \\
\frac{\tau_i}{|d_i|} & \text{if } |d_i| > \tau_i
\end{cases}$$
where adaptive threshold $\tau_i = \tau_{\text{base}} \times \frac{\sigma_i}{\text{median}(\boldsymbol{\sigma})}$ (with $\tau_{\text{base}} = 80\text{ meters}$).

The combined weighting matrix is:
$$\mathbf{W} = \text{diag}\left(w_1^{\text{Huber}} \cdot \frac{1}{\sigma_1^2}, \dots, w_N^{\text{Huber}} \cdot \frac{1}{\sigma_N^2}\right)$$

#### 4. Normal Equation Solve
The Gauss-Newton parameter update is:
$$\Delta \mathbf{P} = \left(\mathbf{A}^T \mathbf{W} \mathbf{A}\right)^{-1} \mathbf{A}^T \mathbf{W} \mathbf{d}$$
$$\mathbf{P}^{(k+1)} = \mathbf{P}^{(k)} + \Delta \mathbf{P}$$
Iteration terminates when $\|\Delta \mathbf{P}\| < 10^{-3}\text{ meters}$ or maximum iterations ($10$) is reached.

---

### 4.4 Geometric Dilution of Precision (GDOP)
The geometric stability of the tower constellation is derived from the covariance of the geometry matrix:
$$\mathbf{Q}_{P} = \left(\mathbf{A}^T \mathbf{W} \mathbf{A}\right)^{-1} \in \mathbb{R}^{3 \times 3}$$
$$\text{GDOP} = \sqrt{\text{Tr}\left(\mathbf{Q}_P\right)} = \sqrt{Q_{11} + Q_{22} + Q_{33}}$$

* $\text{GDOP} < 2.0$: **Excellent** geometry (towers evenly distributed around suspect).
* $2.0 \le \text{GDOP} \le 5.0$: **Good / Moderate** geometry.
* $\text{GDOP} > 5.0$: **Poor / Collinear** geometry (towers in a straight line; high dilution of precision).

---

### 4.5 Initial Position Seeding via Sector Wedge Polygon Clipping
Non-linear solvers can diverge if initialized far from the true position. To guarantee global convergence, the pipeline seeds $\mathbf{P}^{(0)}$ using the geometric intersection of antenna radiation wedges:
1. Each tower sector generates a polygon wedge $W_i$ defined by origin $(x_i, y_i)$, radius $\rho_i$, boresight azimuth $\theta_i$, and beamwidth $\beta_i$:
   $$W_i = \text{make\_sector\_polygon}(x_i, y_i, \rho_i, \theta_i, \beta_i)$$
2. The polygon intersection $I = W_1 \cap W_2 \cap \dots \cap W_N$ is computed via Shapely.
3. The seed position $[x^{(0)}, y^{(0)}]$ is taken as the **centroid** of the intersection polygon $I$.
4. If the intersection is empty (disjoint sectors), the fallback uses the weighted sector clipping centroid (`compute_sector_clipping_centroid`).

---

## 5. Stage 2: Kinematic Kalman Tracker

### 5.1 State Vector & Transition Formulation
To denoise the sequential track and remove multipath ping-pong jitter, Stage 2 executes a discrete Kalman Filter:
$$\mathbf{x}_k = \begin{bmatrix} x_k \\ y_k \\ v_{x, k} \\ v_{y, k} \end{bmatrix} \in \mathbb{R}^{4 \times 1}$$

* State Transition Matrix $\mathbf{F}(\Delta t)$:
  $$\mathbf{F} = \begin{bmatrix}
  1 & 0 & \Delta t & 0 \\
  0 & 1 & 0 & \Delta t \\
  0 & 0 & 1 & 0 \\
  0 & 0 & 0 & 1
  \end{bmatrix}$$
* Measurement Matrix $\mathbf{H}$:
  $$\mathbf{H} = \begin{bmatrix}
  1 & 0 & 0 & 0 \\
  0 & 1 & 0 & 0
  \end{bmatrix}$$

---

### 5.2 Time Update (Prediction Step)
$$\hat{\mathbf{x}}_{k|k-1} = \mathbf{F} \hat{\mathbf{x}}_{k-1|k-1}$$
$$\mathbf{P}_{k|k-1} = \mathbf{F} \mathbf{P}_{k-1|k-1} \mathbf{F}^T + \mathbf{Q}_k$$

#### Discrete Process Noise Covariance $\mathbf{Q}_k$
For piecewise continuous white-noise acceleration with spectral variance $\sigma_a^2$:
$$\mathbf{Q}_k = \begin{bmatrix}
\frac{\Delta t^4}{4} & 0 & \frac{\Delta t^3}{2} & 0 \\
0 & \frac{\Delta t^4}{4} & 0 & \frac{\Delta t^3}{2} \\
\frac{\Delta t^3}{2} & 0 & \Delta t^2 & 0 \\
0 & \frac{\Delta t^3}{2} & 0 & \Delta t^2
\end{bmatrix} \sigma_a^2$$

#### Adaptive Maneuver Scaling
If the suspect abruptly turns or accelerates, the innovation residual norm $\|z_k - \hat{x}_{k|k-1}\|$ surges. Process noise is scaled adaptively:
$$q_{\text{scale}} = \max\left(1.0, \left(\frac{\|z_k - \hat{x}_{k|k-1}\|}{50.0}\right)^2\right)$$
$$\mathbf{Q}_k^{\text{adaptive}} = \mathbf{Q}_k \times q_{\text{scale}}$$

---

### 5.3 Adaptive Measurement Noise Covariance $\mathbf{R}_k$
Measurement noise is scaled dynamically based on Stage 1 multilateration quality:
$$\mathbf{R}_k = \mathbf{R}_{\text{base}} \times s_{\text{uncertainty}} \times s_{\text{GDOP}} \times s_{\text{residual}}$$
$$s_{\text{uncertainty}} = \frac{\sigma_{\text{TA}}}{\sigma_{\text{base}}}, \quad s_{\text{GDOP}} = \max(1.0, \text{GDOP}^2), \quad s_{\text{residual}} = 1.0 + \left(\frac{\text{RMS}}{\sigma_{\text{base}}}\right)^2$$
*When tower geometry is poor or residual RMS is high, $\mathbf{R}_k$ expands, causing the filter to trust its internal kinematic state over the noisy measurement.*

---

### 5.4 Mahalanobis Distance Outlier Gating & Rogue BTS Detection
Before assimilating measurement $\mathbf{z}_k$, the innovation $\mathbf{y}_k$ and innovation covariance $\mathbf{S}_k$ are tested:
$$\mathbf{y}_k = \mathbf{z}_k - \mathbf{H} \hat{\mathbf{x}}_{k|k-1}$$
$$\mathbf{S}_k = \mathbf{H} \mathbf{P}_{k|k-1} \mathbf{H}^T + \mathbf{R}_k$$
The squared Mahalanobis distance is evaluated against the 99% Chi-square threshold for 2 degrees of freedom:
$$d_M^2 = \mathbf{y}_k^T \mathbf{S}_k^{-1} \mathbf{y}_k$$
$$\chi^2_{0.99, 2} = 9.21$$

* If $d_M^2 > 9.21$, the measurement implies an unphysical teleportation (e.g., >500 km/h).
* **Action**: Measurement is **rejected** from the track update.
* **Security Trigger**: The tower CGIs associated with that frame are flagged as potential **Rogue BTS / IMSI-Catcher transmitters**.

---

### 5.5 Measurement Update & Joseph Form Covariance Correction
* Kalman Gain:
  $$\mathbf{K}_k = \mathbf{P}_{k|k-1} \mathbf{H}^T \mathbf{S}_k^{-1}$$
* State Update:
  $$\hat{\mathbf{x}}_{k|k} = \hat{\mathbf{x}}_{k|k-1} + \mathbf{K}_k \mathbf{y}_k$$
* **Joseph Form Covariance Update**:
  $$\mathbf{P}_{k|k} = (\mathbf{I} - \mathbf{K}_k \mathbf{H}) \mathbf{P}_{k|k-1} (\mathbf{I} - \mathbf{K}_k \mathbf{H})^T + \mathbf{K}_k \mathbf{R}_k \mathbf{K}_k^T$$
  *(Guarantees numerical symmetry and positive-definiteness under floating-point precision).*

---

## 6. Stage 3: Probability Distribution & Heatmap Engine

### 6.1 Current Implementation: Metric Gaussian Mixture (`heatmap.py`)
The existing heatmap engine builds a normalized 2D Gaussian density mixture over the Kalman-smoothed fixes:
1. Fix positions are shifted to local metric coordinates relative to the track centroid origin:
   $$\mathbf{p}_i = [E_i - E_{\text{origin}}, N_i - N_{\text{origin}}]^T$$
2. The 95% confidence radius $r_i$ defines the variance $\sigma_i = \frac{r_i}{\sqrt{5.991}} \approx \frac{r_i}{2.447}$.
3. For an arbitrary grid node $\mathbf{u} = [x, y]^T$, the Mahalanobis distance is:
   $$D_i^2(\mathbf{u}) = (\mathbf{u} - \mathbf{p}_i)^T \mathbf{\Sigma}_i^{-1} (\mathbf{u} - \mathbf{p}_i)$$
4. Likelihood intensity is accumulated as:
   $$f(\mathbf{u}) = \sum_{i=1}^M \frac{1}{r_i} \exp\left(-\frac{1}{2} D_i^2(\mathbf{u})\right)$$
5. Evaluated over a discrete grid mesh with resolution $\Delta = 50\text{ meters}$, normalized to $[0.0, 1.0]$, and emitted as a GeoJSON FeatureCollection of weighted Point coordinates.

---

### 6.2 The True Telecom Joint Signal Likelihood (Theoretical Target)
The mathematically complete probability density function of suspect position $(x, y)$ directly integrates raw tower signal physics:

$$P(x, y \mid \text{Tower Observations}) \propto \prod_{i=1}^N P_{\text{TA}}(x, y \mid \text{TA}_i) \times P_{\text{Sector}}(x, y \mid \theta_i, \beta_i) \times P_{\text{RSSI}}(x, y \mid \text{RSSI}_i)$$

1. **Timing Advance Probability Density** (Annular Gaussian Ring):
   $$P_{\text{TA}}(x, y) = \frac{1}{\sqrt{2\pi}\sigma_{\text{TA}}} \exp\left(-\frac{\left(\sqrt{(x-x_i)^2 + (y-y_i)^2} - \rho_i\right)^2}{2\sigma_{\text{TA}}^2}\right)$$
2. **Sector Radiation Lobe Density** (Cosine or Gaussian Angular Lobe):
   $$P_{\text{Sector}}(x, y) = \exp\left(-\frac{(\phi_i(x, y) - \theta_i)^2}{2 (\beta_i / 2.355)^2}\right)$$
   where $\phi_i(x, y) = \text{atan2}(x - x_i, y - y_i)$ is the bearing angle from tower $i$.
3. **RSSI Path-Loss Likelihood** (Log-Normal Shadow Fading):
   $$P_{\text{RSSI}}(x, y) = \frac{1}{\sqrt{2\pi}\sigma_{\text{shadow}}} \exp\left(-\frac{\left(\text{RSSI}_{\text{meas}} - [P_{\text{tx}} - \text{PL}(d_i)]\right)^2}{2\sigma_{\text{shadow}}^2}\right)$$

*The product of these densities forms the true intersecting crescent-shaped search zone that pinpoints the specific building or street.*

---

## 7. Forensic Reporting & Export Standards

All export endpoints enforce case-level Role-Based Access Control (RBAC) and write an immutable event to `audit_logs`.

### 7.1 CSV Export (`/api/case/{case_id}/export/csv`)
Outputs machine-readable tabular telemetry with the following columns:
* `Fix ID`, `Timestamp (IST)`, `Latitude`, `Longitude`
* `Velocity East (m/s)`, `Velocity North (m/s)`, `Speed (km/h)`
* `Confidence Radius (m)`, `GDOP`, `Residual RMS (m)`
* `TA Inner Bound (m)`, `TA Outer Bound (m)`, `Mean RSSI (dBm)`

### 7.2 KML Geospatial Export (`/api/case/{case_id}/export/kml`)
Generates Keyhole Markup Language (KML 2.2) files for Google Earth / GIS command centers:
* **Track Polyline**: Color-coded continuous kinematic trajectory.
* **Placemarks**: Individual fix points containing timestamp, speed, and accuracy bubbles.
* **Confidence Circles**: 95% circular error probable boundary polygons.
* **Sector Wedges**: 3D extruded polygons visualizing tower antenna boresights.

### 7.3 Section 65B Certified Forensic PDF Export (`/api/case/{case_id}/export/pdf`)
In Indian law, electronic records are admissible under **Section 65B of the Indian Evidence Act (1872)** only when accompanied by an authorized certificate verifying system integrity:
* **Case Identity Block**: Case Name, Police Station, Investigating Officer (IO), Reference FIR Number.
* **Cryptographic Evidence Fingerprint**: SHA-256 hash of original ingested CDR files and final fix ledger.
* **System Hardware & Software Environment**: Server hostname, OS version, PostGIS version, and database connection ID.
* **Deterministic Audit Trail**: Chronological officer action ledger with IP addresses and timestamps.
* **Section 65B Declaration**: Standard statutory declaration confirming computer system was operating properly with unbroken chain of custody, concluding with the Investigating Officer's signature block.
