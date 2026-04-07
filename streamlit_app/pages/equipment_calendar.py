import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, timedelta, date

from data.equipment import EQUIPMENT_MAP, EQUIPMENT
from data.labs import LABS, LAB_MAP
from utils.scheduling import flatten_bookings
from utils.formatting import format_currency, format_date_display


def render_equipment_calendar(projects):
    st.title("Equipment Calendar")
    st.markdown("---")

    all_bookings = flatten_bookings(projects)
    today = datetime.now().date()

    if not all_bookings:
        st.info("No bookings found. Create a project to get started.")
        return

    # ── Sidebar Filters ───────────────────────────────────────────────────────
    with st.sidebar:
        st.header("Calendar Filters")

        lab_options = ["All Labs"] + [lab["name"] for lab in LABS]
        selected_lab = st.selectbox("Filter by Lab", lab_options)

        min_date = min(b["start_date"] for b in all_bookings)
        max_date = max(b["end_date"] for b in all_bookings)

        min_dt = datetime.strptime(min_date, "%Y-%m-%d").date()
        max_dt = datetime.strptime(max_date, "%Y-%m-%d").date()

        date_from = st.date_input(
            "From Date",
            value=min_dt,
            min_value=min_dt,
            max_value=max_dt,
        )
        date_to = st.date_input(
            "To Date",
            value=max_dt,
            min_value=min_dt,
            max_value=max_dt,
        )

        selected_project = st.selectbox(
            "Filter by Project",
            ["All Projects"] + [p["name"] for p in projects],
        )

    # ── Build Gantt Data ───────────────────────────────────────────────────────
    gantt_rows = []
    for b in all_bookings:
        eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
        lab_id = eq.get("lab_id", "")
        lab_name = LAB_MAP.get(lab_id, "Unknown")
        eq_name = eq.get("name", b["equipment_id"])
        cost_per_day = eq.get("cost_per_day", 0)
        cost = cost_per_day * b["duration_days"]

        # Apply filters
        if selected_lab != "All Labs" and lab_name != selected_lab:
            continue
        if selected_project != "All Projects" and b["project_name"] != selected_project:
            continue
        b_start = datetime.strptime(b["start_date"], "%Y-%m-%d").date()
        b_end = datetime.strptime(b["end_date"], "%Y-%m-%d").date()
        if b_end < date_from or b_start > date_to:
            continue

        gantt_rows.append({
            "Project": b["project_name"],
            "Deliverable": b["deliverable_name"],
            "Equipment": eq_name,
            "Lab": lab_name,
            "Start": b["start_date"],
            "Finish": b["end_date"],
            "Duration (days)": b["duration_days"],
            "Cost/Day": format_currency(cost_per_day),
            "Total Cost": format_currency(cost),
            "Notes": b.get("notes", ""),
            "Auto-Scheduled": "Yes" if b.get("auto_scheduled") else "No",
        })

    # ── Gantt Chart ───────────────────────────────────────────────────────────
    st.subheader(f"Equipment Schedule ({len(gantt_rows)} Bookings)")

    if gantt_rows:
        df_gantt = pd.DataFrame(gantt_rows)
        df_gantt["Start_dt"] = pd.to_datetime(df_gantt["Start"])
        df_gantt["Finish_dt"] = pd.to_datetime(df_gantt["Finish"]) + pd.Timedelta(days=1)

        chart_height = max(500, len(df_gantt["Equipment"].unique()) * 32 + 120)

        fig = px.timeline(
            df_gantt,
            x_start="Start_dt",
            x_end="Finish_dt",
            y="Equipment",
            color="Project",
            hover_data={
                "Start_dt": False,
                "Finish_dt": False,
                "Start": True,
                "Finish": True,
                "Lab": True,
                "Deliverable": True,
                "Duration (days)": True,
                "Total Cost": True,
                "Notes": True,
                "Auto-Scheduled": True,
            },
            title="Equipment Utilization Gantt",
            height=chart_height,
        )
        fig.update_yaxes(autorange="reversed")
        fig.update_xaxes(
            range=[
                str(date_from),
                str(date_to + timedelta(days=1)),
            ]
        )
        # Today line
        today_str_cal = today.strftime("%Y-%m-%d")
        fig.add_shape(
            type="line",
            x0=today_str_cal, x1=today_str_cal,
            y0=0, y1=1,
            xref="x", yref="paper",
            line=dict(color="red", width=2, dash="dash"),
        )
        fig.update_layout(
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=10, r=10, t=80, b=10),
            xaxis_title="Date",
            yaxis_title="Equipment",
        )
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No bookings match the current filter.")

    # ── Lab Utilization Stats ─────────────────────────────────────────────────
    st.markdown("---")
    st.subheader("Current Lab Utilization")

    today_str = today.strftime("%Y-%m-%d")
    lab_stats = {}

    for b in all_bookings:
        eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
        lab_id = eq.get("lab_id", "")
        if not lab_id:
            continue
        if lab_id not in lab_stats:
            lab_stats[lab_id] = {"total": 0, "booked": 0}
        lab_stats[lab_id]["total"] += 1
        # Count as currently booked if today falls within the booking
        if b["start_date"] <= today_str <= b["end_date"]:
            lab_stats[lab_id]["booked"] += 1

    # Total equipment per lab
    for eq in EQUIPMENT:
        lab_id = eq["lab_id"]
        if lab_id not in lab_stats:
            lab_stats[lab_id] = {"total": 0, "booked": 0}

    stat_rows = []
    for lab_id, stats in lab_stats.items():
        lab_name = LAB_MAP.get(lab_id, lab_id)
        total_eq = sum(1 for e in EQUIPMENT if e["lab_id"] == lab_id)
        booked = stats["booked"]
        util_pct = round((booked / total_eq * 100) if total_eq > 0 else 0, 1)
        stat_rows.append({
            "Lab": lab_name,
            "Total Equipment": total_eq,
            "Currently Booked": booked,
            "Utilization %": util_pct,
        })

    if stat_rows:
        df_stats = pd.DataFrame(stat_rows).sort_values("Utilization %", ascending=False)

        col1, col2 = st.columns([2, 1])
        with col1:
            fig_util = px.bar(
                df_stats[df_stats["Currently Booked"] > 0],
                x="Lab",
                y="Utilization %",
                color="Utilization %",
                color_continuous_scale="RdYlGn_r",
                title="Labs with Active Bookings Today",
                height=350,
            )
            fig_util.update_layout(
                xaxis_tickangle=-35,
                showlegend=False,
                margin=dict(l=10, r=10, t=50, b=100),
            )
            st.plotly_chart(fig_util, use_container_width=True)

        with col2:
            active_labs = df_stats[df_stats["Currently Booked"] > 0]
            st.metric("Labs Active Today", len(active_labs))
            st.metric(
                "Equipment In Use",
                int(df_stats["Currently Booked"].sum()),
                f"of {int(df_stats['Total Equipment'].sum())} total",
            )

        with st.expander("Full Lab Utilization Table"):
            st.dataframe(df_stats, use_container_width=True, hide_index=True)

    # ── Bookings Table ────────────────────────────────────────────────────────
    st.markdown("---")
    st.subheader("Booking Details Table")
    if gantt_rows:
        display_cols = ["Project", "Deliverable", "Equipment", "Lab", "Start", "Finish",
                        "Duration (days)", "Cost/Day", "Total Cost", "Notes"]
        df_table = pd.DataFrame(gantt_rows)[display_cols]
        st.dataframe(df_table, use_container_width=True, hide_index=True)
    else:
        st.info("No bookings to display.")
