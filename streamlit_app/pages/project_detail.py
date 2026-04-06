import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, date
import uuid

from data.equipment import EQUIPMENT, EQUIPMENT_MAP
from data.labs import LABS, LAB_MAP
from utils.scheduling import (
    flatten_bookings,
    check_conflict,
    find_next_available,
    compute_end_date,
    compute_project_cost,
    compute_deliverable_cost,
)
from utils.formatting import (
    format_currency,
    format_date_display,
    status_badge_html,
)


def _get_project(projects, project_id):
    for p in projects:
        if p["id"] == project_id:
            return p
    return None


def _color_for_deliverable(idx):
    colors = [
        "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
        "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    ]
    return colors[idx % len(colors)]


def render_project_detail(projects):
    project_id = st.session_state.get("selected_project_id")

    if not project_id:
        st.warning("No project selected. Go to Projects and select one.")
        if st.button("Go to Projects"):
            st.session_state.current_page = "Projects"
            st.rerun()
        return

    project = _get_project(projects, project_id)
    if not project:
        st.error(f"Project '{project_id}' not found.")
        return

    # ── Header ─────────────────────────────────────────────────────────────────
    col_title, col_back = st.columns([5, 1])
    with col_title:
        st.title(project["name"])
    with col_back:
        if st.button("Back to Projects"):
            st.session_state.selected_project_id = None
            st.session_state.current_page = "Projects"
            st.rerun()

    col_info1, col_info2, col_info3 = st.columns(3)
    col_info1.markdown(f"**Client:** {project['client']}")
    col_info2.markdown(f"**Created:** {format_date_display(project['created_at'])}")
    col_info3.markdown(
        f"**Status:** {status_badge_html(project['status'])}",
        unsafe_allow_html=True,
    )

    st.markdown(f"*{project['description']}*")
    st.markdown("---")

    # ── Edit Status ────────────────────────────────────────────────────────────
    with st.expander("Edit Project Status", expanded=False):
        new_status = st.selectbox(
            "Status",
            ["Draft", "Scheduled", "Active", "Completed"],
            index=["Draft", "Scheduled", "Active", "Completed"].index(project["status"]),
            key=f"status_select_{project_id}",
        )
        if st.button("Update Status", key=f"update_status_{project_id}"):
            for p in st.session_state.projects:
                if p["id"] == project_id:
                    p["status"] = new_status
                    break
            st.success(f"Status updated to **{new_status}**")
            st.rerun()

    # ── Summary Metrics ────────────────────────────────────────────────────────
    n_deliverables = len(project["deliverables"])
    n_bookings = sum(len(d["bookings"]) for d in project["deliverables"])
    total_cost = compute_project_cost(project, EQUIPMENT_MAP)

    mc1, mc2, mc3 = st.columns(3)
    mc1.metric("Deliverables", n_deliverables)
    mc2.metric("Total Bookings", n_bookings)
    mc3.metric("Estimated Cost", format_currency(total_cost))

    st.markdown("---")

    # ── Project Gantt Chart ───────────────────────────────────────────────────
    st.subheader("Project Schedule (Gantt Chart)")
    all_system_bookings = flatten_bookings(st.session_state.projects)

    gantt_rows = []
    for idx, d in enumerate(project["deliverables"]):
        for b in d["bookings"]:
            eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
            eq_name = eq.get("name", b["equipment_id"])
            lab_name = LAB_MAP.get(eq.get("lab_id", ""), "Unknown")
            cost = eq.get("cost_per_day", 0) * b["duration_days"]
            gantt_rows.append({
                "Deliverable": d["name"],
                "Equipment": eq_name,
                "Lab": lab_name,
                "Start": b["start_date"],
                "Finish": b["end_date"],
                "Duration": b["duration_days"],
                "Cost": format_currency(cost),
            })

    if gantt_rows:
        df_gantt = pd.DataFrame(gantt_rows)
        df_gantt["Start_dt"] = pd.to_datetime(df_gantt["Start"])
        df_gantt["Finish_dt"] = pd.to_datetime(df_gantt["Finish"]) + pd.Timedelta(days=1)

        fig = px.timeline(
            df_gantt,
            x_start="Start_dt",
            x_end="Finish_dt",
            y="Equipment",
            color="Deliverable",
            hover_data={
                "Start_dt": False,
                "Finish_dt": False,
                "Start": True,
                "Finish": True,
                "Lab": True,
                "Duration": True,
                "Cost": True,
            },
            title=f"Schedule for {project['name']}",
            height=max(300, len(gantt_rows) * 30 + 100),
        )
        fig.update_yaxes(autorange="reversed")
        today_str = datetime.now().date().strftime("%Y-%m-%d")
        fig.add_shape(
            type="line",
            x0=today_str, x1=today_str,
            y0=0, y1=1,
            xref="x", yref="paper",
            line=dict(color="red", width=2, dash="dash"),
        )
        fig.add_annotation(
            x=today_str, y=1,
            xref="x", yref="paper",
            text="Today",
            showarrow=False,
            yanchor="bottom",
            font=dict(color="red", size=11),
        )
        fig.update_layout(margin=dict(l=10, r=10, t=60, b=10))
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No bookings yet for this project.")

    st.markdown("---")

    # ── Cost Summary Table ────────────────────────────────────────────────────
    st.subheader("Cost Summary")
    cost_rows = []
    for d in project["deliverables"]:
        for b in d["bookings"]:
            eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
            eq_name = eq.get("name", b["equipment_id"])
            lab_name = LAB_MAP.get(eq.get("lab_id", ""), "Unknown")
            cpd = eq.get("cost_per_day", 0)
            subtotal = cpd * b["duration_days"]
            cost_rows.append({
                "Deliverable": d["name"],
                "Equipment": eq_name,
                "Lab": lab_name,
                "Start": format_date_display(b["start_date"]),
                "End": format_date_display(b["end_date"]),
                "Duration (days)": b["duration_days"],
                "Cost/Day": format_currency(cpd),
                "Subtotal": format_currency(subtotal),
            })

    if cost_rows:
        df_cost = pd.DataFrame(cost_rows)
        st.dataframe(df_cost, use_container_width=True, hide_index=True)
        st.markdown(f"### Grand Total: **{format_currency(total_cost)}**")
    else:
        st.info("No bookings to display costs for.")

    st.markdown("---")

    # ── Deliverables Section ───────────────────────────────────────────────────
    st.subheader("Deliverables & Bookings")

    for d_idx, deliverable in enumerate(project["deliverables"]):
        with st.expander(
            f"Deliverable {d_idx + 1}: {deliverable['name']} "
            f"({len(deliverable['bookings'])} bookings — "
            f"{format_currency(compute_deliverable_cost(deliverable, EQUIPMENT_MAP))})",
            expanded=True,
        ):
            st.markdown(f"*{deliverable['description']}*")

            # Bookings table for this deliverable
            if deliverable["bookings"]:
                bkg_rows = []
                for b in deliverable["bookings"]:
                    eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
                    eq_name = eq.get("name", b["equipment_id"])
                    lab_name = LAB_MAP.get(eq.get("lab_id", ""), "Unknown")
                    cpd = eq.get("cost_per_day", 0)
                    subtotal = cpd * b["duration_days"]
                    bkg_rows.append({
                        "Equipment": eq_name,
                        "Lab": lab_name,
                        "Start": format_date_display(b["start_date"]),
                        "End": format_date_display(b["end_date"]),
                        "Days": b["duration_days"],
                        "Cost/Day": format_currency(cpd),
                        "Subtotal": format_currency(subtotal),
                        "Notes": b.get("notes", ""),
                        "Auto-Scheduled": "Yes" if b.get("auto_scheduled") else "No",
                    })
                df_bkg = pd.DataFrame(bkg_rows)
                st.dataframe(df_bkg, use_container_width=True, hide_index=True)
            else:
                st.info("No bookings yet for this deliverable.")

            # Add Booking form
            st.markdown("**Add a New Booking**")
            with st.form(key=f"add_booking_{deliverable['id']}"):
                # Equipment selector organized by lab
                eq_options = {}
                for eq in EQUIPMENT:
                    lab_name = LAB_MAP.get(eq["lab_id"], eq["lab_id"])
                    label = f"[{lab_name}] {eq['name']} — {format_currency(eq['cost_per_day'])}/day"
                    eq_options[label] = eq["id"]

                selected_eq_label = st.selectbox(
                    "Equipment",
                    options=list(eq_options.keys()),
                    key=f"eq_select_{deliverable['id']}",
                )
                selected_eq_id = eq_options[selected_eq_label]

                col_dur, col_start = st.columns(2)
                with col_dur:
                    duration = st.number_input(
                        "Duration (days)",
                        min_value=1,
                        max_value=365,
                        value=5,
                        key=f"duration_{deliverable['id']}",
                    )
                with col_start:
                    pref_start = st.date_input(
                        "Preferred Start Date",
                        value=date.today(),
                        key=f"pref_start_{deliverable['id']}",
                    )

                notes = st.text_input(
                    "Notes (optional)",
                    key=f"notes_{deliverable['id']}",
                )

                auto_schedule = st.checkbox(
                    "Auto-schedule if conflict detected",
                    value=True,
                    key=f"auto_{deliverable['id']}",
                )

                submitted = st.form_submit_button("Add Booking", type="primary")

            if submitted:
                pref_start_str = pref_start.strftime("%Y-%m-%d")
                end_str = compute_end_date(pref_start_str, int(duration))

                conflicts = check_conflict(
                    all_system_bookings, selected_eq_id, pref_start_str, end_str
                )

                if conflicts and not auto_schedule:
                    conflict_info = ", ".join(
                        f"{c['project_name']} ({c['start_date']} to {c['end_date']})"
                        for c in conflicts
                    )
                    st.error(
                        f"Conflict detected with existing booking(s): {conflict_info}. "
                        "Enable 'Auto-schedule' to find the next available slot."
                    )
                else:
                    final_start = pref_start_str
                    was_rescheduled = False
                    if conflicts and auto_schedule:
                        final_start, was_rescheduled = find_next_available(
                            all_system_bookings, selected_eq_id, pref_start_str, int(duration)
                        )

                    final_end = compute_end_date(final_start, int(duration))
                    new_booking = {
                        "id": f"bkg-{uuid.uuid4().hex[:8]}",
                        "deliverable_id": deliverable["id"],
                        "project_id": project_id,
                        "equipment_id": selected_eq_id,
                        "start_date": final_start,
                        "end_date": final_end,
                        "duration_days": int(duration),
                        "notes": notes,
                        "auto_scheduled": was_rescheduled,
                    }

                    # Update session state
                    for p in st.session_state.projects:
                        if p["id"] == project_id:
                            for d in p["deliverables"]:
                                if d["id"] == deliverable["id"]:
                                    d["bookings"].append(new_booking)
                                    break
                            break

                    eq_obj = EQUIPMENT_MAP.get(selected_eq_id, {})
                    if was_rescheduled:
                        st.warning(
                            f"Conflict detected. Booking auto-scheduled to start "
                            f"{format_date_display(final_start)} — "
                            f"{format_date_display(final_end)} on "
                            f"{eq_obj.get('name', selected_eq_id)}."
                        )
                    else:
                        st.success(
                            f"Booking added: {eq_obj.get('name', selected_eq_id)} "
                            f"from {format_date_display(final_start)} to "
                            f"{format_date_display(final_end)}."
                        )
                    st.rerun()
