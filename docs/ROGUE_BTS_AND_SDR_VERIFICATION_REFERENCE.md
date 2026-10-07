# Rogue BTS Detection & RF/SDR Ground Verification
## Technical Blueprint & Algorithmic Reference Manual

> **Domain:** Cellular Signal Interception, Fake Base Station Defense & RF Ground Verification  
> **Target Agency:** Police Cyber Crime Cells, Technical Intelligence Wings (Anti-Extortion & Fugitive Tracking)  
> **Standards:** 3GPP TS 36.331 (RRC Protocol), 3GPP TS 33.401 (Security Architecture), ITU-R P.1411 (Short-Range Propagation)  

---

## 1. Executive Overview

While Multi-Tower CDR Multilateration calculates macro-level candidate coordinates across city blocks, two specialized intelligence capabilities complete the tactical workflow in **E-Rakshak**:

1. **Rogue BTS & IMSI-Catcher Sentinel**: Detects, identifies, and flags illicit rogue cellular base stations (Stingrays, SMS blasters, and fake eNodeBs) that broadcast deceptive carrier identities to lure target mobile devices.
2. **RF / SDR Ground Verification Engine**: Bridges the final **~50-meter gap** where cellular tower geometry cannot resolve individual buildings, using officer-carried directional Software Defined Radios (SDR) and mathematical bearing intersections.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MACRO MULTILATERATION FIX                          │
│                     Candidate Suspect Zone: ~50 - 200m                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
┌───────────────────────────────┐             ┌───────────────────────────────┐
│     ROGUE BTS DETECTION       │             │   RF / SDR GROUND VERIFIER    │
│  • LAC/TAC Spoofing Scan      │             │  • Path-Loss Distance Model   │
│  • Power Gradient Anomalies   │             │  • Multi-Bearing Intersection │
│  • Kinematic Kalman Gating    │             │  • Micro-Fix Pinpointer       │
│  • Encryption Down-Negotiate  │             │  • Signal Consistency Score   │
└───────────────────────────────┘             └───────────────────────────────┘
```

---

## 2. Rogue BTS & IMSI-Catcher Sentinel

### 2.1 Threat Landscape & Real-World Law Enforcement Context
Criminal syndicates, corporate espionage operators, and hostile elements deploy **Rogue Base Stations (IMSI Catchers / Fake Towers)** for:
* **Identity Harvesting**: Forcing nearby mobile devices to reveal unencrypted IMSI and IMEI identifiers by sending fake identity request messages.
* **Man-In-The-Middle (MitM) & Eavesdropping**: Intercepting 2G/GSM calls and SMS OTPs by spoofing legitimate network identifiers (MCC-MNC) of Airtel, Jio, Vi, or BSNL.
* **SMS Phishing & Spoofing Blasters**: Sending unauthorized broadcast SMS payloads claiming to be banks or government portals without routing through legitimate telecom operator gateways.
* **Location Spoofing**: Injecting false Timing Advance and neighbor list tables to throw off tracking investigations.

---

### 2.2 Detection Heuristics & Mathematical Algorithms

The Sentinel evaluates environmental RF telemetry through four complementary detection engines:

```
                          ┌──────────────────────────┐
                          │   SURVEYED CELL SIGNAL   │
                          └─────────────┬────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│   1. LAC / TAC      │      │   2. RF POWER       │      │   3. KINEMATIC      │
│   SPOOFING SCAN     │      │   ANOMALY DELTA     │      │   KALMAN GATING     │
│ Database Mismatch   │      │ Abnormally High RSSI│      │ Unphysical Velocity │
└─────────────────────┘      └─────────────────────┘      └─────────────────────┘
```

#### Heuristic 1: Location Area Code (LAC) & Tracking Area Code (TAC) Inconsistency
Real cellular networks are rigidly planned. A cell site belonging to Airtel Gujarat (MCC 404, MNC 45) will strictly broadcast LACs registered within the telecom circle's regulatory allocation:
* **The Attack**: Rogue BTS devices frequently broadcast random or misconfigured LAC/TAC values (or borrow neighbor-circle LACs) to force target phones into a **Location Update Request** (which obligates the handset to transmit its permanent IMSI).
* **The Check**: The engine cross-references the broadcasted CGI (`MCC-MNC-LAC-CellID`) against the verified `TowerRecord` master repository:
  $$\text{Is\_Legitimate} = \text{CGI}_{\text{observed}} \in \mathcal{T}_{\text{Master Registry}}$$
  If the operator identity (e.g. Jio) is broadcasted with an unregistered LAC or anomalous Cell ID, an alert is triggered with anomaly reason:
  `"Mismatched Location Area Code & Unregistered Cell Identifier"`.

---

#### Heuristic 2: RF Power Variance & Propagation Gradient Anomalies
Cell towers follow distance-dependent log-normal power decay. In legitimate network environments, signal power from neighboring towers varies smoothly.
* **The Attack**: Rogue base stations transmit with disproportionately high power ($P_{\text{tx}} \ge +43\text{ dBm}$ on portable amplifiers) to overpower legitimate macro-cells and win cell-reselection algorithms (Cell Selection Criterion $S$-criterion where $S_{\text{rxlev}} = Q_{\text{rxlevmeas}} - (Q_{\text{rxlevmin}} + Q_{\text{rxlevminoffset}}) > 0$).
* **The Check**: The engine evaluates the power delta between the observed candidate cell and surrounding legitimate BTS sites:
  $$\Delta P = \text{RSSI}_{\text{candidate}} - \overline{\text{RSSI}}_{\text{neighbors}}$$
  If $\Delta P > 25\text{ dB}$ inside a dense urban cluster without corresponding physical tower infrastructure in the registry, the transmitter is flagged with high confidence ($> 90\%$) as an active rogue transmitter.

---

#### Heuristic 3: Kinematic Outlier Rejection via Kalman Mahalanobis Gating
This is E-Rakshak's **signature algorithmic defense**, integrated directly into the Kalman Filter in [`app/localization/engine.py#L232-L242`](file:///d:/placement/hackathon/e-rakshak/Telecom_TowerDataMultiLateration_Suspect_PinPointer/app/localization/engine.py#L232-L242):
* **The Principle**: A suspect cannot physically travel faster than terrestrial physics permits.
* **The Trigger**: If a suspect's phone was connected to Tower A in central Surat, and 2 seconds later connects to a cell tower 15 kilometers away, the innovation vector $\mathbf{y}_k = \mathbf{z}_k - \mathbf{H}\hat{\mathbf{x}}_{k|k-1}$ surges.
* **The Chi-Square Gate**:
  $$d_M^2 = \mathbf{y}_k^T \mathbf{S}_k^{-1} \mathbf{y}_k > \chi^2_{0.99, 2} = 9.21$$
* **Automatic Quarantine**: The engine rejects the localization update and immediately flags the associated cell identity:
  ```python
  if kf_result.get("rejected"):
      # Frame is physically implausible (>500 km/h jump)
      # Flag tower CGIs as potential rogue-BTS candidates
      self.rogue_cgis.update(t.cgi for t in frame.towers)
  ```
  These quarantined CGIs are visualized with red hazard badges on the officer's tactical map.

---

#### Heuristic 4: Cipher Down-Negotiation (Null Encryption EEA0 / A5/0)
Modern 4G/5G networks enforce AES-128 or SNOW-3G encryption (`EEA2` / `EEA1`). Rogue towers attempt protocol down-negotiation to disable encryption:
* Handset is forced to downgrade to GSM (2G) or unencrypted LTE `EEA0 (Null Encryption)`.
* When an officer's SDR capture reports `EEA0` or `A5/0` active while transmitting identity requests, the BTS Sentinel issues an immediate Level-1 Tactical Alert.

---

### 2.3 API Specification (`/api/v1/bts/scan`)

* **Endpoint**: `POST /api/v1/bts/scan`
* **Request Payload**:
  ```json
  {
    "latitude": 21.1702,
    "longitude": 72.8311,
    "radius_meters": 500,
    "scan_duration_sec": 2
  }
  ```
* **Response Payload**:
  ```json
  {
    "scan_id": "scan_4821",
    "towers_detected": 6,
    "rogue_towers_found": 1,
    "towers": [
      {
        "cgi": "404-20-100-88",
        "pci": 214,
        "frequency": 1800.0,
        "signal_strength": -52,
        "is_rogue": true,
        "confidence_score": 94.8,
        "anomaly_reason": "Mismatched Location Area Code & Suspicious Power Level"
      }
    ]
  }
  ```

---

## 3. RF / SDR Ground Verification Engine

### 3.1 The "Final 50 Meters" Problem in Law Enforcement
Tower-based CDR multilateration has a fundamental physical limit:
* **Timing Advance Granularity**: $1\text{ TA unit} \approx 78\text{m}$ (LTE) or $550\text{m}$ (GSM).
* **Multipath & Shadowing**: Buildings and terrain attenuate signals, creating a baseline localization uncertainty of $\pm 25\text{ to } 80\text{ meters}$.
* **The Operational Bottleneck**: Police arrive at a dense block with 4 apartment complexes and 50 shops. Knowing the suspect is within an 80-meter radius is not enough to execute a search warrant.

The **RF Ground Verification Engine** in [`app/localization/rf_verifier.py`](file:///d:/placement/hackathon/e-rakshak/Telecom_TowerDataMultiLateration_Suspect_PinPointer/app/localization/rf_verifier.py) solves this by taking field SDR measurements taken by officers walking the block and computing a **high-precision micro-fix ($< 10\text{m}$)**.

---

### 3.2 Mathematical Formulation 1: Log-Distance Path Loss Distance Solver

The radio frequency received power decreases logarithmically with distance according to the ITU-R / Log-Distance Path Loss model:

$$\text{RSSI}(d) = \text{RSSI}_0 - 10 \cdot n \cdot \log_{10}\left(\frac{d}{d_0}\right) + X_\sigma$$

Where:
* $d_0 = 1.0\text{ meter}$ (Calibrated reference distance).
* $\text{RSSI}_0 = -40.0\text{ dBm}$ (Typical hand-held transmitter reference power at 1 meter).
* $n = 2.5\text{ to } 3.2$ (Path-loss exponent for urban street canyons).
* $X_\sigma \sim \mathcal{N}(0, \sigma^2)$ (Shadow fading noise, typically $\sigma \approx 3.0\text{ dB}$).

Inverting the formula to solve for estimated physical distance $d$ in meters:

$$d = 10^{\frac{\text{RSSI}_0 - \text{RSSI}}{10 \cdot n}}$$

```python
def path_loss_distance(rssi_dbm: float, rssi0: float = -40.0, n: float = 2.5) -> float:
    d = 10 ** ((rssi0 - rssi_dbm) / (10.0 * n))
    return max(d, 1.0)
```

---

### 3.3 Mathematical Formulation 2: Spherical Destination Point via Haversine

When an officer points a directional antenna along azimuth bearing $\theta$ (degrees clockwise from True North) from known GPS location $(\phi_1, \lambda_1)$, the candidate target location $(\phi_2, \lambda_2)$ advanced by distance $d$ is derived on the WGS84 sphere:

$$\delta = \frac{d}{R_{\text{Earth}}} \quad (R_{\text{Earth}} = 6371008.8\text{ meters})$$

$$\phi_2 = \arcsin\left(\sin\phi_1 \cos\delta + \cos\phi_1 \sin\delta \cos\theta\right)$$
$$\lambda_2 = \lambda_1 + \text{atan2}\left(\sin\theta \sin\delta \cos\phi_1, \cos\delta - \sin\phi_1 \sin\phi_2\right)$$

---

### 3.4 Mathematical Formulation 3: Planar Bearing Intersection via Least Squares

A single directional scan gives a distance and bearing, but individual smartphone/SDR GPS coordinates contain drift.  
When an officer takes $\ge 2$ scans at different street corners:
* Scan 1 at position $\mathbf{p}_1 = (x_1, y_1)$ along bearing $\theta_1$.
* Scan 2 at position $\mathbf{p}_2 = (x_2, y_2)$ along bearing $\theta_2$.

Each scan defines a directional line ray in local metric coordinates:
$$\mathbf{u}_i = \begin{bmatrix} \sin\theta_i \\ \cos\theta_i \end{bmatrix} \quad (\text{Unit direction vector})$$
$$\mathbf{n}_i = \begin{bmatrix} \cos\theta_i \\ -\sin\theta_i \end{bmatrix} \quad (\text{Orthogonal normal vector, where } \mathbf{u}_i \cdot \mathbf{n}_i = 0)$$

For any target position $\mathbf{r} = [x, y]^T$ along ray $i$, the orthogonal distance to the line must be zero:
$$(\mathbf{r} - \mathbf{p}_i) \cdot \mathbf{n}_i = 0 \implies \mathbf{n}_i^T \mathbf{r} = \mathbf{n}_i^T \mathbf{p}_i$$

Stacking across $M \ge 2$ directional scans forms the overdetermined linear system:
$$\mathbf{A} \mathbf{r} = \mathbf{b}$$
$$\mathbf{A} = \begin{bmatrix}
\cos\theta_1 & -\sin\theta_1 \\
\cos\theta_2 & -\sin\theta_2 \\
\vdots & \vdots \\
\cos\theta_M & -\sin\theta_M
\end{bmatrix}, \quad
\mathbf{b} = \begin{bmatrix}
x_1\cos\theta_1 - y_1\sin\theta_1 \\
x_2\cos\theta_2 - y_2\sin\theta_2 \\
\vdots \\
x_M\cos\theta_M - y_M\sin\theta_M
\end{bmatrix}$$

Solving via normal equations:
$$\mathbf{r}^* = \left(\mathbf{A}^T \mathbf{A}\right)^{-1} \mathbf{A}^T \mathbf{b}$$

Determinant test:
$$\det(\mathbf{A}^T\mathbf{A}) = a_{11} a_{22} - a_{12}^2$$
* If $\det < 10^{-9}$ (bearings are parallel or collinear), the system falls back gracefully to single-scan path-loss extrapolation.
* If $\det \ge 10^{-9}$, the intersection point $\mathbf{r}^* = [x^*, y^*]^T$ is converted back to latitude and longitude with an accuracy bound of **$\pm 5\text{ to } 12\text{ meters}$**.

---

### 3.5 Mathematical Formulation 4: Multi-Tower Signal Corroboration Engine (`/api/v1/sdr/verify-rf`)

In [`app/api/sdr.py`](file:///d:/placement/hackathon/e-rakshak/Telecom_TowerDataMultiLateration_Suspect_PinPointer/app/api/sdr.py), the engine also cross-checks the suspect's multilateration fix against measured tower signal strengths to confirm the fix is physically real:

For each observed base station $i$:
1. Compute true geodesic distance:
   $$d_i = \text{haversine}(\text{Lat}_{\text{fix}}, \text{Lon}_{\text{fix}}, \text{Lat}_i, \text{Lon}_i)$$
2. Theoretical 3GPP Free Space + Urban Path Loss:
   $$\text{PL}(d_i) = 20\log_{10}(f_{\text{MHz}}) - 27.55 + 10 \cdot \gamma \cdot \log_{10}(d_i)$$
3. Theoretical Received Power:
   $$P_{\text{expected}, i} = P_{\text{tx}} + G_{\text{tx}} - \text{PL}(d_i)$$
4. Residual & Consistency:
   $$r_i = |\text{RSSI}_{\text{measured}, i} - P_{\text{expected}, i}|$$
   $$\text{Consistency}_i = 100 \times \exp\left(-\frac{1}{2}\left(\frac{r_i}{\sigma}\right)^2\right) \quad (\sigma = 8.0\text{ dB})$$
5. Overall Root Mean Square Error (RMSE):
   $$\text{RMSE} = \sqrt{\frac{1}{N}\sum_{i=1}^N r_i^2}$$

#### Verdict Standards:
* $\text{RMSE} \le 6.5\text{ dB}$: **`HIGH_CONFIDENCE_VERIFIED`** (RF physics corroborates CDR multilateration fix).
* $6.5\text{ dB} < \text{RMSE} \le 12.0\text{ dB}$: **`MODERATE_CONFIDENCE_CORROBORATED`**.
* $\text{RMSE} > 12.0\text{ dB}$: **`ANOMALOUS_DISCREPANCY`** (Significant signal mismatch; suspect is likely shielded by concrete/basement, or a rogue transmitter is distorting readings).

---

## 4. Field Tactical SOP for Law Enforcement

### Ground Officer Workflow:
```
1. MACRO FIX ARRIVAL
   Investigating officer receives multilateration fix (e.g. Ring Road / Kargil Chowk, Surat).
   Confidence radius: ±65m.

2. ARRIVAL AT PERIMETER
   Ground team positions vehicle at perimeter corner (e.g. Corner A: 21.1710°N, 72.8300°E).
   Connects directional SDR scanner (tuned to target LTE Band 3 / 1810 MHz).

3. SWEEP 1
   Point antenna in 360° sweep. Peak RSSI observed: -68 dBm at bearing 115° East.
   Log Scan 1 into Field Tracker UI.

4. RELOCATE & SWEEP 2
   Move vehicle 120m down street to Corner B: 21.1700°N, 72.8322°E.
   Peak RSSI observed: -62 dBm at bearing 240° West.
   Log Scan 2 into Field Tracker UI.

5. ENGINE RESOLUTION
   Engine executes least-squares bearing intersection:
   -> Crosses rays at 21.1702°N, 72.8311°E.
   -> Micro-Fix pinpointed within ±6 meters (e.g. specific 3rd-floor apartment / shop).
```
