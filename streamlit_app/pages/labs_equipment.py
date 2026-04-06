import streamlit as st
import pandas as pd
from datetime import datetime

from data.equipment import EQUIPMENT, EQUIPMENT_MAP
from data.labs import LABS, LAB_MAP
from utils.scheduling import flatten_bookings
from utils.formatting import format_currency, format_date_display


def render_labs_equipment(projects):
    st.title("Labs & Equipment")
    st.markdown("---")

    today = datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")

    all_bookings = flatten_bookings(projects)

    # Build a map: equipment_id -> current/next booking info
    eq_booking_status = {}
    for b in all_bookings:
        eq_id = b["equipment_id"]
        b_start = b["start_date"]
        b_end = b["end_date"]

        if b_start <= today_str <= b_end:
            # Currently booked
            if eq_id not in eq_booking_status or eq_booking_status[eq_id]["priority"] < 2:
                eq_booking_status[eq_id] = {
                    "status": f"Booked until {format_date_display(b_end)}",
                    "project": b["project_name"],
                    "priority": 2,
                    "end_date": b_end,
                }
        elif b_start > today_str:
            # Future booking
            if eq_id not in eq_booking_status or (
                eq_booking_status[eq_id]["priority"] < 1
                or (
                    eq_booking_status[eq_id]["priority"] == 1
                    and b_start < eq_booking_status[eq_id].get("end_date", "9999-12-31")
                )
            ):
                eq_booking_status[eq_id] = {
                    "status": f"Booked from {format_date_display(b_start)}",
                    "project": b["project_name"],
                    "priority": 1,
                    "end_date": b_end,
                }

    # ── Summary Stats ──────────────────────────────────────────────────────────
    total_eq = len(EQUIPMENT)
    currently_booked = sum(
        1 for eq_id, info in eq_booking_status.items() if info["priority"] == 2
    )
    total_labs = len(LABS)

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Labs", total_labs)
    col2.metric("Total Equipment", total_eq)
    col3.metric("Currently Booked", currently_booked)
    col4.metric("Available Now", total_eq - currently_booked)

    st.markdown("---")

    # ── Search Bar ─────────────────────────────────────────────────────────────
    search_query = st.text_input(
        "Search equipment across all labs",
        placeholder="e.g. CT Scanner, Viscometer, HPHT...",
    )

    st.markdown("---")

    # ── If searching, show flat results ───────────────────────────────────────
    if search_query.strip():
        q = search_query.lower()
        matching = [
            eq for eq in EQUIPMENT
            if q in eq["name"].lower()
            or q in LAB_MAP.get(eq["lab_id"], "").lower()
        ]
        st.subheader(f"Search Results for '{search_query}' ({len(matching)} items)")
        if matching:
            rows = []
            for eq in matching:
                lab_name = LAB_MAP.get(eq["lab_id"], "Unknown")
                status_info = eq_booking_status.get(eq["id"])
                status_str = status_info["status"] if status_info else "Available"
                project_str = status_info["project"] if status_info else "—"
                rows.append({
                    "Equipment": eq["name"],
                    "Lab": lab_name,
                    "Cost/Day": format_currency(eq["cost_per_day"]),
                    "Status": status_str,
                    "Project": project_str,
                })
            df = pd.DataFrame(rows)
            st.dataframe(df, use_container_width=True, hide_index=True)
        else:
            st.info("No equipment matches your search.")
        return

    # ── Lab-by-Lab Expandable Sections ────────────────────────────────────────
    # Group equipment by lab
    lab_equipment_map = {}
    for eq in EQUIPMENT:
        lab_id = eq["lab_id"]
        if lab_id not in lab_equipment_map:
            lab_equipment_map[lab_id] = []
        lab_equipment_map[lab_id].append(eq)

    for lab in LABS:
        lab_id = lab["id"]
        lab_eqs = lab_equipment_map.get(lab_id, [])
        booked_count = sum(
            1 for eq in lab_eqs
            if eq["id"] in eq_booking_status and eq_booking_status[eq["id"]]["priority"] == 2
        )
        available_count = len(lab_eqs) - booked_count

        # Expander title with utilization summary
        expander_label = (
            f"{lab['name']}  —  "
            f"{len(lab_eqs)} equipment  |  "
            f"{booked_count} booked  |  "
            f"{available_count} available"
        )

        with st.expander(expander_label, expanded=False):
            if not lab_eqs:
                st.info("No equipment defined for this lab.")
                continue

            rows = []
            for eq in lab_eqs:
                status_info = eq_booking_status.get(eq["id"])
                if status_info and status_info["priority"] == 2:
                    status_str = status_info["status"]
                    project_str = status_info["project"]
                    badge_color = "#dc3545"  # red = booked
                elif status_info and status_info["priority"] == 1:
                    status_str = status_info["status"]
                    project_str = status_info["project"]
                    badge_color = "#fd7e14"  # orange = upcoming
                else:
                    status_str = "Available"
                    project_str = "—"
                    badge_color = "#198754"  # green = free

                rows.append({
                    "Equipment": eq["name"],
                    "ID": eq["id"],
                    "Cost/Day": format_currency(eq["cost_per_day"]),
                    "Status": status_str,
                    "Project": project_str,
                })

            df = pd.DataFrame(rows)
            # Apply styling to Status column
            def highlight_status(val):
                if "Booked until" in str(val):
                    return "background-color: #ffe0e0; color: #dc3545; font-weight: bold"
                elif "Booked from" in str(val):
                    return "background-color: #fff3cd; color: #856404; font-weight: bold"
                else:
                    return "background-color: #d1e7dd; color: #0f5132; font-weight: bold"

            styled_df = df.style.applymap(highlight_status, subset=["Status"])
            st.dataframe(styled_df, use_container_width=True, hide_index=True)

    # ── Aggregate Utilization Table ────────────────────────────────────────────
    st.markdown("---")
    st.subheader("Lab Utilization Summary")

    util_rows = []
    for lab in LABS:
        lab_id = lab["id"]
        lab_eqs = lab_equipment_map.get(lab_id, [])
        n_total = len(lab_eqs)
        if n_total == 0:
            continue
        n_booked = sum(
            1 for eq in lab_eqs
            if eq["id"] in eq_booking_status and eq_booking_status[eq["id"]]["priority"] == 2
        )
        n_upcoming = sum(
            1 for eq in lab_eqs
            if eq["id"] in eq_booking_status and eq_booking_status[eq["id"]]["priority"] == 1
        )
        util_pct = round((n_booked / n_total) * 100, 1)
        daily_rate = sum(eq["cost_per_day"] for eq in lab_eqs)
        util_rows.append({
            "Lab": lab["name"],
            "Total Equipment": n_total,
            "Currently Booked": n_booked,
            "Upcoming Bookings": n_upcoming,
            "Available Now": n_total - n_booked,
            "Utilization %": util_pct,
            "Daily Rate (all eq)": format_currency(daily_rate),
        })

    if util_rows:
        df_util = pd.DataFrame(util_rows).sort_values("Utilization %", ascending=False)
        st.dataframe(df_util, use_container_width=True, hide_index=True)
