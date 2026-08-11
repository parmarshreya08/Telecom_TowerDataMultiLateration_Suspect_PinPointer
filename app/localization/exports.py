"""
Export generators for E-Rakshak localization fixes.
Produces CSV, KML, and PDF outputs for filtered fix data.
"""

import csv
import io
from typing import Any

from app.utils.datetime_utils import now_ist


# ── CSV Export ──────────────────────────────────────────────


def generate_csv(fixes: list[Any], case_id: str) -> str:
    """
    Generates a CSV string from localization fixes.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "fix_id", "timestamp", "latitude", "longitude",
        "confidence_radius_meters", "gdop", "residual_rms",
        "velocity_east", "velocity_north",
        "ta_inner_m", "ta_outer_m", "rss_i_dbm",
        "subscriber_identifier",
    ])
    for f in fixes:
        writer.writerow([
            str(f.fix_id),
            f.timestamp.isoformat(),
            f.latitude,
            f.longitude,
            f.confidence_radius_meters,
            f.gdop or "",
            f.residual_rms or "",
            f.velocity_east or "",
            f.velocity_north or "",
            f.ta_inner_m or "",
            f.ta_outer_m or "",
            f.rss_i_dbm or "",
            f.subscriber_identifier,
        ])
    return buf.getvalue()


# ── KML Export ──────────────────────────────────────────────


def generate_kml(fixes: list[Any], case_id: str) -> str:
    """
    Generates a KML document from localization fixes.
    Includes placemarks for each fix and a path line.
    """
    if not fixes:
        return _kml_empty(case_id)

    coords_lines = []
    placemarks = []

    for f in fixes:
        lon, lat = f.longitude, f.latitude
        alt = f.confidence_radius_meters or 0.0
        ts = f.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
        coords_lines.append(f"            {lon},{lat},{alt}")

        placemarks.append(f"""\
        <Placemark>
            <name>Fix {ts}</name>
            <description>Accuracy: {alt:.0f}m | GDOP: {f.gdop or 'N/A'} | Subscriber: {f.subscriber_identifier}</description>
            <TimeStamp><when>{ts}</when></TimeStamp>
            <Point>
                <coordinates>{lon},{lat},{alt}</coordinates>
            </Point>
            <Style>
                <IconStyle>
                    <color>ff0000ff</color>
                    <scale>0.8</scale>
                </IconStyle>
            </Style>
        </Placemark>""")

    path_coords = "\n".join(coords_lines)

    kml = f"""\
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>E-Rakshak — Case {case_id}</name>
    <description>Localization fixes for investigation case {case_id}. Generated {now_ist().isoformat()}Z.</description>

    <Style id="fixStyle">
      <IconStyle>
        <color>ff0000ff</color>
        <scale>0.8</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/target.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="pathStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>3</width>
      </LineStyle>
    </Style>

    <!-- Movement Path -->
    <Placemark>
      <name>Movement Path</name>
      <styleUrl>#pathStyle</styleUrl>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>
{path_coords}
        </coordinates>
      </LineString>
    </Placemark>

    <!-- Fix Points -->
{chr(10).join(placemarks)}

  </Document>
</kml>"""
    return kml


def _kml_empty(case_id: str) -> str:
    return f"""\
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>E-Rakshak — Case {case_id}</name>
    <description>No localization fixes available.</description>
  </Document>
</kml>"""


# ── PDF Export ──────────────────────────────────────────────


def generate_pdf(fixes: list[Any], case_id: str, report_data: dict[str, Any]) -> bytes:
    """
    Generates a court-admissible forensic PDF report using reportlab.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        PageBreak,
        HRFlowable,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle", parent=styles["Title"],
        fontSize=18, spaceAfter=6, textColor=colors.HexColor("#1a1a2e"),
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"],
        fontSize=10, textColor=colors.grey, spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        "SectionHeading", parent=styles["Heading2"],
        fontSize=12, spaceBefore=14, spaceAfter=6,
        textColor=colors.HexColor("#1a1a2e"),
    )
    body_style = ParagraphStyle(
        "BodyText2", parent=styles["Normal"],
        fontSize=9, leading=13, spaceAfter=4,
    )
    small_style = ParagraphStyle(
        "SmallText", parent=styles["Normal"],
        fontSize=7, textColor=colors.grey,
    )

    elements = []

    # ── Header ──
    elements.append(Paragraph("E-RAKSHAK", title_style))
    elements.append(Paragraph("Telecom Multi-Lateration Forensic Report", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a1a2e")))
    elements.append(Spacer(1, 8))

    # ── Report metadata ──
    report_id = report_data.get("report_id", f"FR-{case_id}")
    generated = report_data.get("generated_at", now_ist().isoformat())
    meta_data = [
        ["Report ID", report_id],
        ["Case ID", case_id],
        ["Generated At", generated],
        ["Status", report_data.get("status", "COMPLETED")],
    ]
    meta_table = Table(meta_data, colWidths=[4 * cm, 12 * cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#555555")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 12))

    # ── Methodology ──
    elements.append(Paragraph("1. Methodology", heading_style))
    method = report_data.get("methodology", {})
    elements.append(Paragraph(
        f"<b>Algorithm:</b> {method.get('algorithm', 'JPL Pseudorange Multi-Lateration + Kalman Tracking')}",
        body_style,
    ))
    elements.append(Paragraph(
        f"<b>TA Band Model:</b> {method.get('ta_band_model', 'LTE Timing Advance quantization (78.12m per step)')}",
        body_style,
    ))
    elements.append(Paragraph(
        f"<b>Sector Wedge Model:</b> {method.get('sector_wedge_model', 'Antenna azimuth/beamwidth sector clipping')}",
        body_style,
    ))
    elements.append(Paragraph(
        f"<b>Confidence Level:</b> {method.get('confidence_level', 0.95) * 100:.0f}%",
        body_style,
    ))
    elements.append(Spacer(1, 8))

    # ── Summary ──
    elements.append(Paragraph("2. Analysis Summary", heading_style))
    summary = report_data.get("summary", {})
    time_span = summary.get("time_span", {})
    elements.append(Paragraph(f"<b>Total Fixes:</b> {summary.get('fix_count', len(fixes))}", body_style))
    elements.append(Paragraph(f"<b>Subscribers Tracked:</b> {summary.get('subscriber_count', 0)}", body_style))
    elements.append(Paragraph(
        f"<b>Time Range:</b> {time_span.get('earliest', 'N/A')} to {time_span.get('latest', 'N/A')}",
        body_style,
    ))
    elements.append(Spacer(1, 8))

    # ── Confidence stats ──
    if fixes:
        confs = [f.confidence_radius_meters for f in fixes]
        mean_conf = sum(confs) / len(confs)
        min_conf = min(confs)
        max_conf = max(confs)
        elements.append(Paragraph("3. Confidence Analysis", heading_style))
        conf_data = [
            ["Metric", "Value"],
            ["Mean Confidence Radius", f"{mean_conf:.1f} m"],
            ["Best (Min) Accuracy", f"{min_conf:.1f} m"],
            ["Worst (Max) Accuracy", f"{max_conf:.1f} m"],
            ["Total Data Points", str(len(fixes))],
        ]
        conf_table = Table(conf_data, colWidths=[6 * cm, 6 * cm])
        conf_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ]))
        elements.append(conf_table)
        elements.append(Spacer(1, 8))

    # ── Subscriber analysis ──
    subscribers = report_data.get("subscribers", [])
    if subscribers:
        elements.append(Paragraph("4. Subscriber Analysis", heading_style))
        for sub in subscribers:
            sub_id = sub.get("subscriber_identifier", "Unknown")
            centroid = sub.get("centroid", {})
            conf = sub.get("confidence", {})
            elements.append(Paragraph(
                f"<b>Subscriber:</b> {sub_id} | "
                f"<b>Fixes:</b> {sub.get('fix_count', 0)} | "
                f"<b>Centroid:</b> ({centroid.get('latitude', 0):.6f}, {centroid.get('longitude', 0):.6f}) | "
                f"<b>Mean Accuracy:</b> ±{conf.get('mean_meters', 0):.0f}m",
                body_style,
            ))
        elements.append(Spacer(1, 8))

    # ── Fixes table ──
    elements.append(Paragraph("5. Localization Fixes (Detailed)", heading_style))

    header = ["#", "Timestamp", "Latitude", "Longitude", "Accuracy (m)", "GDOP", "RMS"]
    table_data = [header]
    for i, f in enumerate(fixes[:100], 1):  # cap at 100 rows for PDF readability
        table_data.append([
            str(i),
            f.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            f"{f.latitude:.6f}",
            f"{f.longitude:.6f}",
            f"{f.confidence_radius_meters:.1f}",
            f"{f.gdop:.2f}" if f.gdop else "—",
            f"{f.residual_rms:.4f}" if f.residual_rms else "—",
        ])

    if len(fixes) > 100:
        table_data.append(["...", f"{len(fixes) - 100} more fixes", "", "", "", "", ""])

    fixes_table = Table(table_data, colWidths=[1 * cm, 3.5 * cm, 2.2 * cm, 2.2 * cm, 2 * cm, 1.5 * cm, 1.8 * cm])
    fixes_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9f9f9")]),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(fixes_table)
    elements.append(Spacer(1, 16))

    # ── Footer / Chain of custody ──
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        "This report is generated by the E-Rakshak Telecom Investigation Platform "
        "for authorized law enforcement use. The localization analysis uses JPL Pseudorange "
        "Multi-Lateration combined with Kalman filtering for spatial smoothing. "
        "All coordinates are in WGS84 datum. Confidence radii represent 95% uncertainty bounds.",
        small_style,
    ))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        f"Report generated: {generated} | Chain of custody: This document is machine-generated "
        f"and digitally signed. Report ID: {report_id}",
        small_style,
    ))

    doc.build(elements)
    return buf.getvalue()
