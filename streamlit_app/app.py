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

# Separate key for the radio widget — avoids coupling widget state to routing state.
# "Project Detail" is not a radio option; when there, the radio shows "Projects".
if "nav_page" not in st.session_state:
    st.session_state.nav_page = "Dashboard"

# Track what current_page was at the end of the previous run so we can detect
# programmatic navigation (set by other pages before calling st.rerun()).
if "_last_current_page" not in st.session_state:
    st.session_state._last_current_page = "Dashboard"

PAGE_OPTIONS = [
    "Dashboard",
    "Equipment Calendar",
    "Projects",
    "New Project",
    "Labs & Equipment",
]

# ── Sidebar Navigation ─────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ADRIC Scheduler")
    st.markdown("*Petroleum & Geoscience R&D*")
    st.markdown("---")

    # Detect programmatic navigation: current_page changed since last script run
    # (i.e., another page set st.session_state.current_page and called st.rerun()).
    programmatic_change = (
        st.session_state.current_page != st.session_state._last_current_page
    )

    if programmatic_change:
        # Sync radio display to the new current_page.
        # "Project Detail" is not in PAGE_OPTIONS — show "Projects" as selected instead.
        nav_sync = (
            st.session_state.current_page
            if st.session_state.current_page in PAGE_OPTIONS
            else "Projects"
        )
        st.session_state.nav_page = nav_sync

    # key= means Streamlit persists the user's click in session state across reruns,
    # so it is never overridden by a recomputed index= value.
    st.radio(
        "Navigation",
        PAGE_OPTIONS,
        key="nav_page",
        label_visibility="collapsed",
    )

    nav = st.session_state.nav_page
    current = st.session_state.current_page

    # User clicked the sidebar (not a programmatic change).
    # Exception: when on "Project Detail", the radio shows "Projects" as a visual alias —
    # clicking "Projects" there is not a real navigation request.
    if not programmatic_change and nav != current:
        is_project_detail_alias = (current == "Project Detail" and nav == "Projects")
        if not is_project_detail_alias:
            st.session_state.current_page = nav
            st.session_state._last_current_page = nav
            if nav == "New Project":
                st.session_state.wizard_step = 1
                st.session_state.wizard_data = {}
            st.rerun()

    # ── Sidebar Info Panel ─────────────────────────────────────────────────────
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

if page == "Dashboard":
    from pages.dashboard import render_dashboard
    render_dashboard(st.session_state.projects)

elif page == "Equipment Calendar":
    from pages.equipment_calendar import render_equipment_calendar
    render_equipment_calendar(st.session_state.projects)

elif page == "Projects":
    from pages.projects_list import render_projects_list
    render_projects_list(st.session_state.projects)

elif page == "Project Detail":
    from pages.project_detail import render_project_detail
    render_project_detail(st.session_state.projects)

elif page == "New Project":
    from pages.new_project import render_new_project
    render_new_project(st.session_state.projects)

elif page == "Labs & Equipment":
    from pages.labs_equipment import render_labs_equipment
    render_labs_equipment(st.session_state.projects)

else:
    st.error(f"Unknown page: {page}")

# ── Record current_page for next rerun's programmatic change detection ─────────
# Must be at the bottom so it captures the final current_page for this run.
# If a page calls st.rerun() early, this line is never reached — which is correct,
# because _last_current_page should retain the previous run's value in that case.
st.session_state._last_current_page = st.session_state.current_page
