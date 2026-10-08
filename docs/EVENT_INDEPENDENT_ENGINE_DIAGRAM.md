# Event-Independent Localization Engine

```mermaid
flowchart TD
    A[Officer requests<br/>GET /api/case/{case_id}/events/localize] --> B[Check case access]
    B --> C[Load stored subscriber events<br/>ordered by timestamp]
    C --> D{Events found?}
    D -- No --> E[404 No stored events]
    D -- Yes --> F[Map ORM rows to<br/>SubscriberEventRecord]

    F --> G[EventLocalizationEngine.solve_records]
    G --> H[Build event groups]
    H --> I[Event key:<br/>raw event id when available<br/>otherwise subscriber + timestamp + call type]

    I --> J{For each event group}
    J --> K[Initialize observations,<br/>circles, reasons, and ignored list]
    K --> L{For each record in this event}

    L --> M[Resolve tower by CGI]
    M --> N{Tower location available?}
    N -- Catalog lookup --> O[TowerLookupService<br/>DB catalog + cache]
    N -- Fallback --> P[Use coordinates carried<br/>by the event]
    N -- Neither --> Q[Record ignored:<br/>no tower coordinates]
    O --> R[Read measurement fields]
    P --> R

    R --> S{Measurement type<br/>radio_rtt?}
    S -- No --> T[Record ignored:<br/>unsupported type]
    S -- Yes --> U[Parse RTT value and unit]
    U --> V{Valid RTT unit?}
    V -- No --> W[Record ignored:<br/>unknown unit or invalid value]
    V -- Yes --> X[Convert RTT to one-way distance]
    X --> Y[Compute sigma in metres<br/>or use default uncertainty]
    Y --> Z[Store tower observation<br/>and range circle]
    Z --> L
    Q --> L
    T --> L
    W --> L

    L --> AA{At least 3 usable<br/>tower coordinates?}
    AA -- No --> AB[EventResult:<br/>insufficient_data]
    AA -- Yes --> AC[Convert tower coordinates<br/>from lat/lon to UTM]
    AC --> AD[Weighted nonlinear least squares]
    AD --> AE[Iterate position estimate<br/>up to 30 iterations]
    AE --> AF[Calculate residuals,<br/>RMS, GDOP, covariance]
    AF --> AG{RMS <= threshold<br/>and GDOP < 8?}
    AG -- Yes --> AH[EventResult:<br/>resolved]
    AG -- No --> AI[EventResult:<br/>uncertain + quality reason]

    AB --> AJ[Convert result to dictionary]
    AH --> AJ
    AI --> AJ
    AJ --> AK[Convert UTM position to<br/>latitude/longitude]
    AK --> AL[Return case_id, event_count,<br/>and independent results]

    classDef input fill:#e8f1ff,stroke:#2563eb,color:#111827
    classDef decision fill:#fff7ed,stroke:#ea580c,color:#111827
    classDef result fill:#ecfdf5,stroke:#16a34a,color:#111827
    class A,F,G input
    class D,N,S,V,AA,AG decision
    class AB,AH,AI,AL result
```

## Independence guarantees

- Each event group is solved in isolation.
- No Kalman filter or constant-velocity model is used.
- Events are not bundled into time windows.
- A previous event's position never seeds a later event.
- An event with fewer than three usable RTT tower observations returns
  `insufficient_data` rather than an approximated position.
- A geometrically poor fit returns `uncertain`, while preserving residual and
  GDOP diagnostics.

## Main implementation points

- API adapter: `app/api/events_localization.py`
- Event solver: `app/localization/event_engine.py`
- Tower resolution: `app/services/tower_lookup.py`
- NMR persistence branch: `app/ingestion/pipeline.py`
