import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, date
import uuid

from data.equipment import EQUIPMENT, EQUIPMENT_MAP
from data.labs import LABS, LAB_MAP
from utils.scheduling import (
    flatten_bookings,
    flatten_confirmed_bookings,
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

DRAFT_PHASE_STATUSES = {"Draft", "Pending Approval", "Approved"}


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


# ── Workflow Panel ─────────────────────────────────────────────────────────────

def _render_workflow_panel(project, projects):
    """Status pipeline indicator + action buttons."""
    project_id = project["id"]
    status = project["status"]

    pipeline = ["Draft", "Pending Approval", "Approved", "Active", "Completed"]
    pipeline_colors = {
        "Draft": "#6c757d",
        "Pending Approval": "#fd7e14",
        "Approved": "#0d6efd",
        "Active": "#198754",
        "Completed": "#6f42c1",
    }
    current_idx = pipeline.index(status) if status in pipeline else 0

    # Step indicators
    step_cols = st.columns(len(pipeline))
    for i, s in enumerate(pipeline):
        color = pipeline_colors[s]
        if i < current_idx:
            dot = f'<span style="color:{color};font-size:1.4em;">✔</span>'
            label_style = f"color:{color};font-size:0.75em;"
        elif i == current_idx:
            dot = f'<span style="background:{color};color:white;padding:2px 10px;border-radius:10px;font-size:0.8em;font-weight:700;">{s}</span>'
            label_style = ""
        else:
            dot = '<span style="color:#dee2e6;font-size:1.4em;">○</span>'
            label_style = "color:#adb5bd;font-size:0.75em;"

        with step_cols[i]:
            if i == current_idx:
                st.markdown(dot, unsafe_allow_html=True)
            else:
                st.markdown(
                    f'<div style="{label_style}">{dot} {s}</div>',
                    unsafe_allow_html=True,
                )

    st.markdown("")

    # Action buttons
    if status == "Draft":
        if st.button("Submit for Approval →", type="primary", key="wf_submit"):
            _transition_status(projects, project_id, "Pending Approval")

    elif status == "Pending Approval":
        col_approve, col_reject = st.columns(2)
        with col_approve:
            if st.button("Approve Project ✓", type="primary", key="wf_approve"):
                _transition_status(projects, project_id, "Approved")
        with col_reject:
            if st.button("Reject → Back to Draft", key="wf_reject"):
                _transition_status(projects, project_id, "Draft")

    elif status == "Approved":
        st.info("Ready to confirm. This will resolve any conflicts and lock in all equipment bookings.")
        if st.button("Confirm & Book All Equipment", type="primary", key="wf_confirm"):
            st.session_state[f"confirm_preview_{project_id}"] = True
            st.rerun()

    elif status == "Active":
        if st.button("Mark as Completed ✓", key="wf_complete"):
            _transition_status(projects, project_id, "Completed")

    elif status == "Completed":
        st.success("This project is complete.")


def _transition_status(projects, project_id, new_status):
    for p in st.session_state.projects:
        if p["id"] == project_id:
            p["status"] = new_status
            break
    st.rerun()


# ── Confirm Bookings Preview ───────────────────────────────────────────────────

def _render_confirm_modal(project, projects):
    """Show rescheduling preview and commit on confirmation."""
    project_id = project["id"]
    confirmed_bookings = flatten_confirmed_bookings(st.session_state.projects)
    other_confirmed = [b for b in confirmed_bookings if b.get("project_id") != project_id]

    scheduled = []
    rescheduled = []
    added_so_far = []

    for d in project.get("deliverables", []):
        for b in d.get("bookings", []):
            end_date = compute_end_date(b["start_date"], b["duration_days"])
            check_pool = other_confirmed + added_so_far
            conflicts = check_conflict(check_pool, b["equipment_id"], b["start_date"], end_date)

            if not conflicts:
                scheduled.append(b)
                added_so_far.append({**b, "project_id": project_id, "end_date": end_date})
            else:
                new_start, _ = find_next_available(
                    check_pool, b["equipment_id"], b["start_date"], b["duration_days"]
                )
                new_end = compute_end_date(new_start, b["duration_days"])
                eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
                conflict_project = conflicts[0].get("project_name", "another project")
                rescheduled.append({
                    "booking": b,
                    "deliverable_id": d["id"],
                    "eq_name": eq.get("name", b["equipment_id"]),
                    "original_start": b["start_date"],
                    "original_end": end_date,
                    "new_start": new_start,
                    "new_end": new_end,
                    "conflict_project": conflict_project,
                })
                added_so_far.append({
                    **b,
                    "project_id": project_id,
                    "start_date": new_start,
                    "end_date": new_end,
                })

    st.markdown("---")
    st.subheader("Confirm & Book All Equipment")

    col_ok, col_reschedule = st.columns(2)
    with col_ok:
        st.metric("Bookings OK (no conflict)", len(scheduled))
    with col_reschedule:
        st.metric("Will be Auto-Rescheduled", len(rescheduled), delta_color="inverse")

    if rescheduled:
        st.warning(f"{len(rescheduled)} booking(s) have conflicts with confirmed projects and will be rescheduled:")
        reschedule_rows = []
        for r in rescheduled:
            reschedule_rows.append({
                "Equipment": r["eq_name"],
                "Requested Start": format_date_display(r["original_start"]),
                "Requested End": format_date_display(r["original_end"]),
                "New Start": format_date_display(r["new_start"]),
                "New End": format_date_display(r["new_end"]),
                "Conflict With": r["conflict_project"],
            })
        st.dataframe(pd.DataFrame(reschedule_rows), use_container_width=True, hide_index=True)
    else:
        st.success("All bookings are conflict-free and will be confirmed as-is.")

    col_confirm, col_cancel = st.columns(2)
    with col_confirm:
        if st.button("Confirm & Activate Project", type="primary", key="modal_confirm"):
            # Apply resolved bookings
            reschedule_map = {
                (r["deliverable_id"], r["booking"]["id"]): r
                for r in rescheduled
            }
            for p in st.session_state.projects:
                if p["id"] != project_id:
                    continue
                p["status"] = "Active"
                for d in p.get("deliverables", []):
                    for b in d.get("bookings", []):
                        key = (d["id"], b["id"])
                        if key in reschedule_map:
                            r = reschedule_map[key]
                            b["start_date"] = r["new_start"]
                            b["end_date"] = r["new_end"]
                            b["confirmed"] = True
                            b["auto_scheduled"] = True
                        else:
                            end_date = compute_end_date(b["start_date"], b["duration_days"])
                            b["end_date"] = end_date
                            b["confirmed"] = True
                break
            st.session_state[f"confirm_preview_{project_id}"] = False
            st.rerun()
    with col_cancel:
        if st.button("Cancel", key="modal_cancel"):
            st.session_state[f"confirm_preview_{project_id}"] = False
            st.rerun()


# ── Main render ────────────────────────────────────────────────────────────────

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

    status = project["status"]
    is_draft_phase = status in DRAFT_PHASE_STATUSES

    # ── Header ─────────────────────────────────────────────────────────────────
    col_title, col_back = st.columns([5, 1])
    with col_title:
        st.title(project["name"])
    with col_back:
        if st.button("← Back", use_container_width=True):
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

    if is_draft_phase:
        st.warning("Equipment is **not yet reserved**. Bookings are tentative until the project is confirmed and activated.")

    st.markdown("---")

    # ── Workflow Panel ─────────────────────────────────────────────────────────
    st.subheader("Project Workflow")
    _render_workflow_panel(project, projects)

    # Show confirm preview modal if triggered
    if st.session_state.get(f"confirm_preview_{project_id}"):
        _render_confirm_modal(project, projects)
        return  # Don't render rest of page while modal is open

    st.markdown("---")

    # ── Summary Metrics ────────────────────────────────────────────────────────
    n_deliverables = len(project["deliverables"])
    n_bookings = sum(len(d["bookings"]) for d in project["deliverables"])
    total_cost = compute_project_cost(project, EQUIPMENT_MAP)
    n_confirmed = sum(
        1 for d in project["deliverables"] for b in d["bookings"] if b.get("confirmed")
    )
    n_tentative = n_bookings - n_confirmed

    mc1, mc2, mc3, mc4 = st.columns(4)
    mc1.metric("Deliverables", n_deliverables)
    mc2.metric("Total Bookings", n_bookings)
    if is_draft_phase:
        mc3.metric("Tentative Bookings", n_tentative)
        mc4.metric("Estimated Cost (Draft)", format_currency(total_cost))
    else:
        mc3.metric("Confirmed Bookings", n_confirmed)
        mc4.metric("Total Cost", format_currency(total_cost))

    st.markdown("---")

    # ── Project Gantt Chart ───────────────────────────────────────────────────
    if is_draft_phase:
        st.subheader("Tentative Schedule (Not Yet Confirmed)")
    else:
        st.subheader("Project Schedule")

    gantt_rows = []
    for idx, d in enumerate(project["deliverables"]):
        for b in d["bookings"]:
            eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
            eq_name = eq.get("name", b["equipment_id"])
            lab_name = LAB_MAP.get(eq.get("lab_id", ""), "Unknown")
            cost = eq.get("cost_per_day", 0) * b["duration_days"]
            is_tentative = not b.get("confirmed", False)
            gantt_rows.append({
                "Deliverable": d["name"],
                "Equipment": eq_name,
                "Lab": lab_name,
                "Start": b["start_date"],
                "Finish": b["end_date"],
                "Duration": b["duration_days"],
                "Cost": format_currency(cost),
                "Status": "Tentative" if is_tentative else "Confirmed",
                "opacity": 0.45 if is_tentative else 0.9,
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
            pattern_shape="Status",
            pattern_shape_map={"Tentative": "/", "Confirmed": ""},
            hover_data={
                "Start_dt": False,
                "Finish_dt": False,
                "Start": True,
                "Finish": True,
                "Lab": True,
                "Duration": True,
                "Cost": True,
                "Status": True,
            },
            opacity=0.8,
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
        fig.update_layout(margin=dict(l=10, r=10, t=60, b=10))
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No bookings yet for this project.")

    st.markdown("---")

    # ── Cost Summary Table ────────────────────────────────────────────────────
    if is_draft_phase:
        st.subheader("Estimated Cost Summary (Draft)")
    else:
        st.subheader("Cost Summary")

    cost_rows = []
    for d in project["deliverables"]:
        for b in d["bookings"]:
            eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
            eq_name = eq.get("name", b["equipment_id"])
            lab_name = LAB_MAP.get(eq.get("lab_id", ""), "Unknown")
            cpd = eq.get("cost_per_day", 0)
            subtotal = cpd * b["duration_days"]
            is_tentative = not b.get("confirmed", False)
            row = {
                "Deliverable": d["name"],
                "Equipment": eq_name,
                "Lab": lab_name,
                "Start": format_date_display(b["start_date"]),
                "End": format_date_display(b["end_date"]),
                "Duration (days)": b["duration_days"],
                "Cost/Day": format_currency(cpd),
                "Subtotal": format_currency(subtotal),
                "Notes": b.get("notes", ""),
            }
            if is_draft_phase:
                row["Booking Status"] = "Tentative" if is_tentative else "Confirmed"
            cost_rows.append(row)

    if cost_rows:
        df_cost = pd.DataFrame(cost_rows)
        st.dataframe(df_cost, use_container_width=True, hide_index=True)
        label = "Estimated Total (Draft)" if is_draft_phase else "Grand Total"
        st.markdown(f"### {label}: **{format_currency(total_cost)}**")
    else:
        st.info("No bookings to display costs for.")

    st.markdown("---")

    # ── Deliverables Section ───────────────────────────────────────────────────
    st.subheader("Deliverables & Bookings")

    # For conflict detection: confirmed bookings from other projects
    confirmed_bookings = flatten_confirmed_bookings(st.session_state.projects)
    other_confirmed = [b for b in confirmed_bookings if b.get("project_id") != project_id]

    for d_idx, deliverable in enumerate(project["deliverables"]):
        with st.expander(
            f"Deliverable {d_idx + 1}: {deliverable['name']} "
            f"({len(deliverable['bookings'])} bookings — "
            f"{format_currency(compute_deliverable_cost(deliverable, EQUIPMENT_MAP))})",
            expanded=True,
        ):
            st.markdown(f"*{deliverable['description']}*")

            if deliverable["bookings"]:
                bkg_rows = []
                for b in deliverable["bookings"]:
                    eq = EQUIPMENT_MAP.get(b["equipment_id"], {})
                    eq_name = eq.get("name", b["equipment_id"])
                    lab_name = LAB_MAP.get(eq.get("lab_id", ""), "Unknown")
                    cpd = eq.get("cost_per_day", 0)
                    subtotal = cpd * b["duration_days"]
                    is_tentative = not b.get("confirmed", False)
                    bkg_rows.append({
                        "Equipment": eq_name,
                        "Lab": lab_name,
                        "Start": format_date_display(b["start_date"]),
                        "End": format_date_display(b["end_date"]),
                        "Days": b["duration_days"],
                        "Cost/Day": format_currency(cpd),
                        "Subtotal": format_currency(subtotal),
                        "Notes": b.get("notes", ""),
                        "Booking Status": "Tentative" if is_tentative else "Confirmed",
                        "Auto-Scheduled": "Yes" if b.get("auto_scheduled") else "No",
                    })
                df_bkg = pd.DataFrame(bkg_rows)
                st.dataframe(df_bkg, use_container_width=True, hide_index=True)
            else:
                st.info("No bookings yet for this deliverable.")

            # Add Booking form — only if project is not Completed/Cancelled
            if status not in ("Completed", "Cancelled"):
                if is_draft_phase:
                    st.caption("Bookings added to draft projects are tentative and will not reserve equipment until confirmed.")

                st.markdown("**Add a New Booking**")
                with st.form(key=f"add_booking_{deliverable['id']}"):
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
                            min_value=1, max_value=365, value=5,
                            key=f"duration_{deliverable['id']}",
                        )
                    with col_start:
                        pref_start = st.date_input(
                            "Preferred Start Date",
                            value=date.today(),
                            key=f"pref_start_{deliverable['id']}",
                        )

                    notes = st.text_input("Notes (optional)", key=f"notes_{deliverable['id']}")

                    if is_draft_phase:
                        btn_label = "Add to Tentative Schedule"
                    else:
                        btn_label = "Add Booking"
                    submitted = st.form_submit_button(btn_label, type="primary")

                if submitted:
                    pref_start_str = pref_start.strftime("%Y-%m-%d")
                    end_str = compute_end_date(pref_start_str, int(duration))

                    if is_draft_phase:
                        # Check against confirmed bookings only; auto-schedule if needed
                        conflicts = check_conflict(
                            other_confirmed, selected_eq_id, pref_start_str, end_str
                        )
                        final_start = pref_start_str
                        was_rescheduled = False
                        if conflicts:
                            final_start, was_rescheduled = find_next_available(
                                other_confirmed, selected_eq_id, pref_start_str, int(duration)
                            )
                        confirmed_flag = False
                    else:
                        # Active project: hard block on conflict
                        all_confirmed = flatten_confirmed_bookings(st.session_state.projects)
                        conflicts = check_conflict(
                            all_confirmed, selected_eq_id, pref_start_str, end_str,
                            exclude_id=None
                        )
                        if conflicts:
                            conflict_info = ", ".join(
                                f"{c.get('project_name', '?')} ({c['start_date']} to {c['end_date']})"
                                for c in conflicts
                            )
                            st.error(
                                f"Equipment is already booked: {conflict_info}. "
                                "Choose a different date or equipment."
                            )
                            st.stop()
                        final_start = pref_start_str
                        was_rescheduled = False
                        confirmed_flag = True

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
                        "confirmed": confirmed_flag,
                    }

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
                            f"Conflict detected. Booking auto-scheduled to "
                            f"{format_date_display(final_start)} — "
                            f"{format_date_display(final_end)} on "
                            f"{eq_obj.get('name', selected_eq_id)} (tentative)."
                        )
                    else:
                        tag = "(tentative)" if not confirmed_flag else ""
                        st.success(
                            f"Booking added {tag}: {eq_obj.get('name', selected_eq_id)} "
                            f"from {format_date_display(final_start)} to "
                            f"{format_date_display(final_end)}."
                        )
                    st.rerun()
