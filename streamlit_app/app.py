import sys
import os

# Ensure the streamlit_app directory is on the Python path so all imports work
sys.path.insert(0, os.path.dirname(__file__))

import streamlit as st

st.set_page_config(
    page_title="ADRIC",
    page_icon="🔬",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Session State Initialization ──────────────────────────────────────────────
if "projects" not in st.session_state:
    from data.seed import get_seed_projects
    st.session_state.projects = get_seed_projects()
    st.session_state.selected_project_id = None
    st.session_state.wizard_step = 1
    st.session_state.wizard_data = {}

if "current_page" not in st.session_state:
    st.session_state.current_page = "Dashboard"

# ── Sidebar Navigation ─────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ADRIC Scheduler")
    st.markdown("*Petroleum & Geoscience R&D*")
    st.markdown("---")

    page_options = [
        "Dashboard",
        "Equipment Calendar",
        "Projects",
        "New Project",
        "Labs & Equipment",
    ]

    # Allow programmatic navigation while keeping the radio in sync
    current_idx = page_options.index(st.session_state.current_page) \
        if st.session_state.current_page in page_options else 0

    # If navigating to Project Detail, keep Projects highlighted in sidebar
    sidebar_idx = current_idx
    if st.session_state.current_page == "Project Detail":
        sidebar_idx = page_options.index("Projects")

    selected_page = st.radio(
        "Navigate to",
        page_options,
        index=sidebar_idx,
        label_visibility="collapsed",
    )

    # Only update current_page from sidebar if user explicitly clicked
    if selected_page != st.session_state.current_page and \
            st.session_state.current_page != "Project Detail":
        st.session_state.current_page = selected_page
        if selected_page == "New Project":
            st.session_state.wizard_step = 1
            st.session_state.wizard_data = {}

    # Sidebar info panel
    st.markdown("---")
    st.markdown(f"**Projects:** {len(st.session_state.projects)}")

    from utils.scheduling import flatten_bookings
    all_bkg = flatten_bookings(st.session_state.projects)
    st.markdown(f"**Total Bookings:** {len(all_bkg)}")

    from datetime import datetime
    today_str = datetime.now().date().strftime("%Y-%m-%d")
    active_bkg = [
        b for b in all_bkg
        if b["start_date"] <= today_str <= b["end_date"]
    ]
    st.markdown(f"**Active Today:** {len(active_bkg)}")

    st.markdown("---")
    st.caption("ADRIC Scheduling System")
    st.caption("Petroleum & Geoscience Facility")

# ── Page Routing ───────────────────────────────────────────────────────────────
page = st.session_state.current_page
projects = st.session_state.projects

# Handle sidebar radio changes when NOT in project detail
if selected_page != page and page != "Project Detail":
    page = selected_page
    st.session_state.current_page = selected_page

if page == "Dashboard":
    from pages.dashboard import render_dashboard
    render_dashboard(projects)

elif page == "Equipment Calendar":
    from pages.equipment_calendar import render_equipment_calendar
    render_equipment_calendar(projects)

elif page == "Projects":
    from pages.projects_list import render_projects_list
    render_projects_list(projects)

elif page == "Project Detail":
    from pages.project_detail import render_project_detail
    render_project_detail(projects)

elif page == "New Project":
    from pages.new_project import render_new_project
    render_new_project(projects)

elif page == "Labs & Equipment":
    from pages.labs_equipment import render_labs_equipment
    render_labs_equipment(projects)

else:
    st.error(f"Unknown page: {page}")
