import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, timedelta

from data.equipment import EQUIPMENT_MAP
from data.labs import LAB_MAP
from utils.scheduling import flatten_bookings, compute_project_cost
from utils.formatting import format_currency, format_date_display, status_badge_html


def render_dashboard(projects):
    st.title("R&D Laboratory Scheduling — Dashboard")
    st.markdown("---")

    today = datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")
    week_str = (today + timedelta(days=7)).strftime("%Y-%m-%d")

    all_bookings = flatten_bookings(projects)

    # ── Metrics ──────────────────────────────────────────────────────────────
    total_projects = len(projects)
    total_bookings = len(all_bookings)
    total_equipment = len(EQUIPMENT_MAP)
    upcoming = sum(
        1 for b in all_bookings
        if b["start_date"] >= today_str and b["start_date"] <= week_str
    )

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Projects", total_projects)
    col2.metric("Total Bookings", total_bookings)
    col3.metric("Total Equipment", total_equipment)
    col4.metric("Starting This Week", upcoming)

    st.markdown("---")

    # ── Recent Projects ───────────────────────────────────────────────────────
    col_left, col_right = st.columns([1, 1])

    with col_left:
        st.subheader("Recent Projects")
        if projects:
            rows = []
            for p in sorted(projects, key=lambda x: x["created_at"], reverse=True)[:5]:
                n_bookings = sum(len(d["bookings"]) for d in p["deliverables"])
                total_cost = compute_project_cost(p, EQUIPMENT_MAP)
                rows.append({
                    "Name": p["name"],
                    "Client": p["client"],
                    "Status": p["status"],
                    "Bookings": n_bookings,
                    "Est. Cost": format_currency(total_cost),
                })
            df = pd.DataFrame(rows)
            st.dataframe(df, use_container_width=True, hide_index=True)
        else:
            st.info("No projects yet.")

    # ── Upcoming Bookings (next 7 days) ───────────────────────────────────────
    with col_right:
        st.subheader("Upcoming Bookings (Next 7 Days)")
        upcoming_bookings = [
            b for b in all_bookings
            if b["start_date"] >= today_str and b["start_date"] <= week_str
        ]
        if upcoming_bookings:
            rows = []
            for b in sorted(upcoming_bookings, key=lambda x: x["start_date"]):
                eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
                lab_name = LAB_MAP.get(eq.get("lab_id", ""), "Unknown")
                rows.append({
                    "Project": b["project_name"],
                    "Equipment": eq.get("name", b["equipment_id"]),
                    "Lab": lab_name,
                    "Start": format_date_display(b["start_date"]),
                    "End": format_date_display(b["end_date"]),
                    "Days": b["duration_days"],
                })
            df = pd.DataFrame(rows)
            st.dataframe(df, use_container_width=True, hide_index=True)
        else:
            st.info("No bookings starting in the next 7 days.")

    st.markdown("---")

    # ── Gantt Overview ────────────────────────────────────────────────────────
    st.subheader("All Bookings Overview (Gantt Chart)")

    if all_bookings:
        gantt_rows = []
        for b in all_bookings:
            eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
            eq_name = eq.get("name", b["equipment_id"])
            lab_name = LAB_MAP.get(eq.get("lab_id", ""), "Unknown")
            cost = eq.get("cost_per_day", 0) * b["duration_days"]
            gantt_rows.append({
                "Project": b["project_name"],
                "Equipment": eq_name,
                "Lab": lab_name,
                "Start": b["start_date"],
                "Finish": b["end_date"],
                "Duration": b["duration_days"],
                "Cost": format_currency(cost),
                "Deliverable": b["deliverable_name"],
            })

        df_gantt = pd.DataFrame(gantt_rows)
        df_gantt["Start"] = pd.to_datetime(df_gantt["Start"])
        # px.timeline needs end date to be exclusive (day after last) for correct display
        df_gantt["Finish"] = pd.to_datetime(df_gantt["Finish"]) + pd.Timedelta(days=1)

        fig = px.timeline(
            df_gantt,
            x_start="Start",
            x_end="Finish",
            y="Equipment",
            color="Project",
            hover_data=["Lab", "Deliverable", "Duration", "Cost"],
            title="Equipment Booking Schedule",
            height=max(400, len(gantt_rows) * 28 + 100),
        )
        fig.update_yaxes(autorange="reversed")
        fig.add_shape(
            type="line",
            x0=today_str, x1=today_str,
            y0=0, y1=1,
            xref="x", yref="paper",
            line=dict(color="red", width=2, dash="dash"),
        )
        fig.update_layout(
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(l=10, r=10, t=80, b=10),
        )
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No bookings to display.")

    # ── Status Distribution ───────────────────────────────────────────────────
    st.markdown("---")
    st.subheader("Project Status Distribution")
    if projects:
        status_counts = {}
        for p in projects:
            s = p["status"]
            status_counts[s] = status_counts.get(s, 0) + 1
        df_status = pd.DataFrame(
            [{"Status": k, "Count": v} for k, v in status_counts.items()]
        )
        color_map = {
            "Draft": "#6c757d",
            "Scheduled": "#0d6efd",
            "Active": "#198754",
            "Completed": "#fd7e14",
        }
        fig2 = px.pie(
            df_status,
            names="Status",
            values="Count",
            color="Status",
            color_discrete_map=color_map,
            title="Projects by Status",
        )
        fig2.update_traces(textinfo="label+value")
        col_a, col_b = st.columns([1, 2])
        col_a.plotly_chart(fig2, use_container_width=True)

        # Cost by project
        cost_rows = []
        for p in projects:
            total_cost = compute_project_cost(p, EQUIPMENT_MAP)
            if total_cost > 0:
                cost_rows.append({"Project": p["name"], "Total Cost": total_cost})
        if cost_rows:
            df_cost = pd.DataFrame(cost_rows).sort_values("Total Cost", ascending=False)
            fig3 = px.bar(
                df_cost,
                x="Project",
                y="Total Cost",
                title="Estimated Cost by Project",
                color="Project",
                text_auto=True,
            )
            fig3.update_layout(showlegend=False, xaxis_tickangle=-20)
            fig3.update_yaxes(tickprefix="$", tickformat=",.0f")
            col_b.plotly_chart(fig3, use_container_width=True)
    else:
        st.info("No projects to display.")
