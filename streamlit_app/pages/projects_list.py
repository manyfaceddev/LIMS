import streamlit as st
import pandas as pd

from data.equipment import EQUIPMENT_MAP
from utils.scheduling import compute_project_cost
from utils.formatting import format_currency, format_date_display, status_badge_html


def render_projects_list(projects):
    st.title("Projects")
    st.markdown("---")

    col_title, col_btn = st.columns([4, 1])
    with col_title:
        st.subheader("All Projects")
    with col_btn:
        if st.button("+ New Project", type="primary", use_container_width=True):
            st.session_state.current_page = "New Project"
            st.rerun()

    # ── Filter Bar ─────────────────────────────────────────────────────────────
    col_search, col_status = st.columns([3, 1])
    with col_search:
        search_query = st.text_input("Search by name or client", placeholder="e.g. Aramco, EOR...")
    with col_status:
        status_filter = st.selectbox(
            "Filter by Status",
            ["All", "Draft", "Scheduled", "Active", "Completed"],
        )

    # ── Filter Logic ───────────────────────────────────────────────────────────
    filtered = projects
    if search_query:
        q = search_query.lower()
        filtered = [
            p for p in filtered
            if q in p["name"].lower() or q in p["client"].lower()
        ]
    if status_filter != "All":
        filtered = [p for p in filtered if p["status"] == status_filter]

    st.markdown(f"Showing **{len(filtered)}** of **{len(projects)}** projects")
    st.markdown("---")

    if not filtered:
        st.info("No projects match your search. Try adjusting the filters.")
        return

    # ── Project Cards / Table ──────────────────────────────────────────────────
    # Build summary dataframe for display
    table_rows = []
    for p in filtered:
        n_deliverables = len(p["deliverables"])
        n_bookings = sum(len(d["bookings"]) for d in p["deliverables"])
        total_cost = compute_project_cost(p, EQUIPMENT_MAP)
        table_rows.append({
            "ID": p["id"],
            "Name": p["name"],
            "Client": p["client"],
            "Status": p["status"],
            "Deliverables": n_deliverables,
            "Bookings": n_bookings,
            "Est. Cost": format_currency(total_cost),
            "Created": format_date_display(p["created_at"]),
        })

    df = pd.DataFrame(table_rows)

    # Show as interactive table with select
    st.markdown("**Click on a row and then use the 'Open Project' button below to view details.**")

    event = st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
    )

    selected_rows = event.selection.rows if event and hasattr(event, "selection") else []

    if selected_rows:
        selected_idx = selected_rows[0]
        selected_project = filtered[selected_idx]
        st.success(f"Selected: **{selected_project['name']}** ({selected_project['client']})")

        col_open, col_cancel = st.columns([1, 3])
        with col_open:
            if st.button("Open Project Detail", type="primary", use_container_width=True):
                st.session_state.selected_project_id = selected_project["id"]
                st.session_state.current_page = "Project Detail"
                st.rerun()
    else:
        st.caption("Select a row above to open a project.")

    # ── Summary Stats ──────────────────────────────────────────────────────────
    st.markdown("---")
    st.subheader("Status Summary")
    status_counts = {}
    for p in projects:
        status_counts[p["status"]] = status_counts.get(p["status"], 0) + 1

    cols = st.columns(4)
    status_list = [("Draft", "#6c757d"), ("Scheduled", "#0d6efd"),
                   ("Active", "#198754"), ("Completed", "#fd7e14")]
    for i, (s, color) in enumerate(status_list):
        count = status_counts.get(s, 0)
        cols[i].markdown(
            f"""
            <div style="background:{color};color:white;padding:16px;border-radius:8px;text-align:center;">
                <div style="font-size:2em;font-weight:bold;">{count}</div>
                <div style="font-size:0.9em;">{s}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
