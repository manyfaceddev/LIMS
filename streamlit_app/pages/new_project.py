import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import date
import uuid

from data.equipment import EQUIPMENT, EQUIPMENT_MAP
from data.labs import LAB_MAP
from utils.scheduling import (
    flatten_confirmed_bookings,
    check_conflict,
    find_next_available,
    compute_end_date,
)
from utils.formatting import format_currency, format_date_display


# ── Helper ─────────────────────────────────────────────────────────────────────

def _reset_wizard():
    st.session_state.wizard_step = 1
    st.session_state.wizard_data = {}


def _eq_label(eq):
    lab_name = LAB_MAP.get(eq["lab_id"], eq["lab_id"])
    return f"[{lab_name}] {eq['name']} — {format_currency(eq['cost_per_day'])}/day"


# ── Main render ────────────────────────────────────────────────────────────────

def render_new_project(projects):
    st.title("New Project Wizard")
    st.markdown("---")

    # Initialize wizard state if needed
    if "wizard_step" not in st.session_state:
        st.session_state.wizard_step = 1
    if "wizard_data" not in st.session_state:
        st.session_state.wizard_data = {}

    step = st.session_state.wizard_step
    wizard_data = st.session_state.wizard_data

    # Progress bar
    st.progress(step / 4, text=f"Step {step} of 4")

    step_labels = [
        "1. Project Info",
        "2. Deliverables",
        "3. Schedule Equipment",
        "4. Review & Confirm",
    ]
    col_steps = st.columns(4)
    for i, label in enumerate(step_labels):
        with col_steps[i]:
            if i + 1 == step:
                st.markdown(f"**:blue[{label}]**")
            elif i + 1 < step:
                st.markdown(f"~~{label}~~")
            else:
                st.markdown(f"*{label}*")

    st.markdown("---")

    # ── Step 1: Project Info ───────────────────────────────────────────────────
    if step == 1:
        st.subheader("Step 1: Project Information")
        with st.form("wizard_step1"):
            name = st.text_input(
                "Project Name *",
                value=wizard_data.get("name", ""),
                placeholder="e.g. Carbonate Reservoir Characterization",
            )
            client = st.text_input(
                "Client *",
                value=wizard_data.get("client", ""),
                placeholder="e.g. Saudi Aramco",
            )
            description = st.text_area(
                "Description",
                value=wizard_data.get("description", ""),
                placeholder="Brief description of the project objectives...",
                height=100,
            )
            submitted = st.form_submit_button("Next →", type="primary")

        if submitted:
            if not name.strip():
                st.error("Project Name is required.")
            elif not client.strip():
                st.error("Client is required.")
            else:
                st.session_state.wizard_data["name"] = name.strip()
                st.session_state.wizard_data["client"] = client.strip()
                st.session_state.wizard_data["description"] = description.strip()
                st.session_state.wizard_data["status"] = "Draft"
                st.session_state.wizard_step = 2
                st.rerun()

    # ── Step 2: Deliverables ───────────────────────────────────────────────────
    elif step == 2:
        st.subheader("Step 2: Define Deliverables")
        st.caption("Add one or more deliverables. Each deliverable groups related equipment bookings.")

        if "deliverable_list" not in wizard_data:
            wizard_data["deliverable_list"] = [{"name": "", "description": ""}]
            st.session_state.wizard_data = wizard_data

        deliverable_list = wizard_data["deliverable_list"]

        # Dynamic deliverable add/remove
        for i, deliv in enumerate(deliverable_list):
            col_name, col_desc, col_del = st.columns([2, 3, 0.5])
            with col_name:
                new_name = st.text_input(
                    f"Deliverable {i + 1} Name",
                    value=deliv["name"],
                    key=f"deliv_name_{i}",
                    placeholder="e.g. Core Plug Analysis",
                )
                deliverable_list[i]["name"] = new_name
            with col_desc:
                new_desc = st.text_input(
                    f"Description",
                    value=deliv["description"],
                    key=f"deliv_desc_{i}",
                    placeholder="Brief description...",
                )
                deliverable_list[i]["description"] = new_desc
            with col_del:
                st.markdown("<br>", unsafe_allow_html=True)
                if len(deliverable_list) > 1:
                    if st.button("✕", key=f"del_deliv_{i}", help="Remove this deliverable"):
                        deliverable_list.pop(i)
                        st.session_state.wizard_data["deliverable_list"] = deliverable_list
                        st.rerun()

        col_add, col_back, col_next = st.columns([2, 1, 1])
        with col_add:
            if st.button("+ Add Deliverable"):
                deliverable_list.append({"name": "", "description": ""})
                st.session_state.wizard_data["deliverable_list"] = deliverable_list
                st.rerun()
        with col_back:
            if st.button("← Back"):
                st.session_state.wizard_step = 1
                st.rerun()
        with col_next:
            if st.button("Next →", type="primary"):
                named = [d for d in deliverable_list if d["name"].strip()]
                if not named:
                    st.error("Add at least one deliverable with a name.")
                else:
                    st.session_state.wizard_data["deliverable_list"] = [
                        d for d in deliverable_list if d["name"].strip()
                    ]
                    # Initialize equipment selections for step 3
                    if "equip_selections" not in wizard_data:
                        wizard_data["equip_selections"] = {}
                    st.session_state.wizard_step = 3
                    st.rerun()

    # ── Step 3: Schedule Equipment ─────────────────────────────────────────────
    elif step == 3:
        st.subheader("Step 3: Schedule Equipment for Each Deliverable")
        st.caption("Select equipment, duration, and preferred start date. Conflicts will be auto-detected.")

        # Only confirmed bookings block slots; wizard bookings are tentative
        all_system_bookings = flatten_confirmed_bookings(st.session_state.projects)
        eq_options = {_eq_label(eq): eq["id"] for eq in EQUIPMENT}
        eq_labels = list(eq_options.keys())

        deliverable_list = wizard_data.get("deliverable_list", [])
        if "equip_selections" not in wizard_data:
            wizard_data["equip_selections"] = {}

        # For each deliverable, allow multiple bookings
        for d_idx, deliv in enumerate(deliverable_list):
            d_key = f"deliv_{d_idx}"
            st.markdown(f"#### Deliverable: {deliv['name']}")

            if d_key not in wizard_data["equip_selections"]:
                wizard_data["equip_selections"][d_key] = []

            selections = wizard_data["equip_selections"][d_key]

            # Display existing selections
            for s_idx, sel in enumerate(selections):
                eq_obj = EQUIPMENT_MAP.get(sel["equipment_id"], {})
                eq_name = eq_obj.get("name", sel["equipment_id"])
                lab_name = LAB_MAP.get(eq_obj.get("lab_id", ""), "Unknown")
                status_icon = "⚠️" if sel.get("auto_scheduled") else "✅"
                st.markdown(
                    f"  {status_icon} **{eq_name}** ({lab_name}) — "
                    f"{sel['duration_days']} days, "
                    f"{format_date_display(sel['start_date'])} to "
                    f"{format_date_display(sel['end_date'])}, "
                    f"Cost: {format_currency(eq_obj.get('cost_per_day', 0) * sel['duration_days'])}"
                    + (" *(auto-rescheduled)*" if sel.get("auto_scheduled") else "")
                )
                if st.button(f"Remove", key=f"rm_{d_key}_{s_idx}"):
                    selections.pop(s_idx)
                    wizard_data["equip_selections"][d_key] = selections
                    st.session_state.wizard_data = wizard_data
                    st.rerun()

            # Form to add a booking to this deliverable
            with st.form(key=f"add_eq_{d_key}"):
                col_eq, col_dur, col_start = st.columns([3, 1, 1])
                with col_eq:
                    sel_label = st.selectbox(
                        "Equipment",
                        eq_labels,
                        key=f"eq_label_{d_key}",
                    )
                with col_dur:
                    duration = st.number_input(
                        "Duration (days)",
                        min_value=1,
                        max_value=365,
                        value=5,
                        key=f"dur_{d_key}",
                    )
                with col_start:
                    pref_start = st.date_input(
                        "Preferred Start",
                        value=date.today(),
                        key=f"start_{d_key}",
                    )
                eq_notes = st.text_input("Notes", key=f"notes_{d_key}")
                add_btn = st.form_submit_button(f"Add Booking to '{deliv['name']}'")

            if add_btn:
                eq_id = eq_options[sel_label]
                pref_start_str = pref_start.strftime("%Y-%m-%d")
                end_str = compute_end_date(pref_start_str, int(duration))

                # Check conflicts against existing system bookings
                conflicts = check_conflict(all_system_bookings, eq_id, pref_start_str, end_str)

                final_start = pref_start_str
                was_rescheduled = False
                if conflicts:
                    final_start, was_rescheduled = find_next_available(
                        all_system_bookings, eq_id, pref_start_str, int(duration)
                    )
                    eq_name_display = EQUIPMENT_MAP.get(eq_id, {}).get("name", eq_id)
                    st.warning(
                        f"Conflict found for {eq_name_display}. "
                        f"Auto-rescheduled to {format_date_display(final_start)}."
                    )
                else:
                    st.success("No conflict — booking slot available.")

                final_end = compute_end_date(final_start, int(duration))
                selections.append({
                    "equipment_id": eq_id,
                    "start_date": final_start,
                    "end_date": final_end,
                    "duration_days": int(duration),
                    "notes": eq_notes,
                    "auto_scheduled": was_rescheduled,
                    "confirmed": False,
                })
                wizard_data["equip_selections"][d_key] = selections
                st.session_state.wizard_data = wizard_data
                st.rerun()

            st.markdown("---")

        col_back, col_next = st.columns([1, 1])
        with col_back:
            if st.button("← Back"):
                st.session_state.wizard_step = 2
                st.rerun()
        with col_next:
            if st.button("Next → Review", type="primary"):
                st.session_state.wizard_step = 4
                st.rerun()

    # ── Step 4: Review & Confirm ───────────────────────────────────────────────
    elif step == 4:
        st.subheader("Step 4: Review & Confirm")

        wizard_data = st.session_state.wizard_data
        deliverable_list = wizard_data.get("deliverable_list", [])
        equip_selections = wizard_data.get("equip_selections", {})

        st.markdown(f"**Project Name:** {wizard_data.get('name', '')}")
        st.markdown(f"**Client:** {wizard_data.get('client', '')}")
        st.markdown(f"**Status:** {wizard_data.get('status', 'Draft')}")
        st.markdown(f"**Description:** {wizard_data.get('description', '')}")
        st.markdown("---")

        total_cost = 0
        gantt_rows = []
        cost_rows = []

        for d_idx, deliv in enumerate(deliverable_list):
            d_key = f"deliv_{d_idx}"
            sels = equip_selections.get(d_key, [])
            st.markdown(f"**Deliverable {d_idx + 1}: {deliv['name']}**")
            if sels:
                for s in sels:
                    eq_obj = EQUIPMENT_MAP.get(s["equipment_id"], {})
                    eq_name = eq_obj.get("name", s["equipment_id"])
                    lab_name = LAB_MAP.get(eq_obj.get("lab_id", ""), "Unknown")
                    cpd = eq_obj.get("cost_per_day", 0)
                    subtotal = cpd * s["duration_days"]
                    total_cost += subtotal
                    cost_rows.append({
                        "Deliverable": deliv["name"],
                        "Equipment": eq_name,
                        "Lab": lab_name,
                        "Start": format_date_display(s["start_date"]),
                        "End": format_date_display(s["end_date"]),
                        "Days": s["duration_days"],
                        "Cost/Day": format_currency(cpd),
                        "Subtotal": format_currency(subtotal),
                        "Auto-Scheduled": "Yes" if s.get("auto_scheduled") else "No",
                    })
                    gantt_rows.append({
                        "Deliverable": deliv["name"],
                        "Equipment": eq_name,
                        "Start": s["start_date"],
                        "Finish": s["end_date"],
                    })
            else:
                st.caption("  No equipment bookings for this deliverable.")

        st.markdown("---")

        if cost_rows:
            st.markdown("**Cost Summary**")
            df_cost = pd.DataFrame(cost_rows)
            st.dataframe(df_cost, use_container_width=True, hide_index=True)
            st.markdown(f"### Estimated Total: **{format_currency(total_cost)}**")
            st.markdown("---")

        if gantt_rows:
            st.markdown("**Schedule Preview**")
            df_gantt = pd.DataFrame(gantt_rows)
            df_gantt["Start_dt"] = pd.to_datetime(df_gantt["Start"])
            df_gantt["Finish_dt"] = pd.to_datetime(df_gantt["Finish"]) + pd.Timedelta(days=1)
            fig = px.timeline(
                df_gantt,
                x_start="Start_dt",
                x_end="Finish_dt",
                y="Equipment",
                color="Deliverable",
                title="Proposed Schedule",
                height=max(300, len(gantt_rows) * 32 + 100),
            )
            fig.update_yaxes(autorange="reversed")
            fig.update_layout(margin=dict(l=10, r=10, t=60, b=10))
            st.plotly_chart(fig, use_container_width=True)

        col_back, col_confirm = st.columns([1, 1])
        with col_back:
            if st.button("← Back to Scheduling"):
                st.session_state.wizard_step = 3
                st.rerun()
        with col_confirm:
            if st.button("Confirm & Save Project", type="primary"):
                # Build project object
                new_project_id = f"proj-{uuid.uuid4().hex[:6]}"
                new_deliverables = []

                for d_idx, deliv in enumerate(deliverable_list):
                    d_key = f"deliv_{d_idx}"
                    sels = equip_selections.get(d_key, [])
                    del_id = f"del-{new_project_id}-{d_idx + 1:02d}"
                    new_bookings = []
                    for b_idx, s in enumerate(sels):
                        bkg_id = f"bkg-{del_id}-{b_idx + 1:02d}"
                        new_bookings.append({
                            "id": bkg_id,
                            "deliverable_id": del_id,
                            "project_id": new_project_id,
                            "equipment_id": s["equipment_id"],
                            "start_date": s["start_date"],
                            "end_date": s["end_date"],
                            "duration_days": s["duration_days"],
                            "notes": s.get("notes", ""),
                            "auto_scheduled": s.get("auto_scheduled", False),
                            "confirmed": False,
                        })
                    new_deliverables.append({
                        "id": del_id,
                        "project_id": new_project_id,
                        "name": deliv["name"],
                        "description": deliv.get("description", ""),
                        "bookings": new_bookings,
                    })

                new_project = {
                    "id": new_project_id,
                    "name": wizard_data["name"],
                    "client": wizard_data["client"],
                    "status": wizard_data.get("status", "Draft"),
                    "description": wizard_data.get("description", ""),
                    "created_at": date.today().strftime("%Y-%m-%d"),
                    "deliverables": new_deliverables,
                }

                st.session_state.projects.append(new_project)
                st.session_state.selected_project_id = new_project_id
                _reset_wizard()
                st.success(f"Project '{new_project['name']}' created successfully!")
                st.session_state.current_page = "Project Detail"
                st.rerun()
